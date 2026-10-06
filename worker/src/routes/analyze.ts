/**
 * POST /api/analyze          — starts a recap analysis
 * GET  /api/analyze/job/:id  — advances / reads that analysis
 *
 * server.ts did everything inside one HTTP request: it uploaded the video to the
 * Gemini Files API, polled until Google finished processing (up to 90 × 3 s),
 * then called generateContent. On Workers a single request cannot stay open that
 * long (the edge proxy returns 524 after ~100 s), so the work is modelled as a
 * resumable job stored in R2:
 *
 *   pending ──▶ uploading ──▶ processing ──▶ generating ──▶ done
 *                    ▲              ▲              ▲
 *                    └──────────────┴──────────────┴── each browser poll advances
 *                                                       the job within a wall-clock
 *                                                       budget (~45 s per request)
 *
 * The long `generateContent` call runs through `ctx.waitUntil()` so the poll
 * request can return immediately; if the isolate is recycled mid-call, the next
 * poll detects the stall and retries the generation once.
 */

import type { AnalyzeJob, AnalyzeParams, Env } from '../types';
import { fail, ok, readJson } from '../lib/http';
import { ApiError } from '../lib/errors';
import { resolveApiKey, type KeySource } from '../lib/keys';
import { headVideo, loadJob, newJobId, readVideoSlice, saveJob } from '../lib/storage';
import { mimeTypeForFilename, probeVideoMetadata } from '../lib/videoMeta';
import {
  UPLOAD_CHUNK_BYTES,
  candidateModels,
  deleteFile,
  generateContent,
  getFile,
  startResumableUpload,
  uploadChunk,
} from '../lib/gemini';
import { buildSystemInstruction, buildUserPrompt, normalizeAnalysis, recapResponseSchema } from '../lib/analysisSpec';
import { generateIntelligentRecapAnalysis } from '../lib/fallback';
import { sleep } from '../lib/sleep';

/** Wall-clock budget per poll request — safely below the ~100 s edge timeout. */
const REQUEST_BUDGET_MS = 45_000;
/** Gemini's hard limit for Files API uploads. */
const GEMINI_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
/** Consider a background generation dead after this long. */
const GENERATION_STALL_MS = 4 * 60 * 1000;
const MAX_GENERATION_ATTEMPTS = 2;

/** In-isolate guard so two concurrent polls cannot advance the same job twice. */
const inFlightJobs = new Set<string>();

interface AnalyzeBody extends AnalyzeParams {
  apiKey?: string;
  /** Optional duration reported by the browser (used when ffprobe-style probing fails). */
  durationSec?: number;
  width?: number;
  height?: number;
}

function buildParams(body: AnalyzeBody): AnalyzeParams {
  return {
    storedName: body.storedName,
    movieName: body.movieName || '',
    episodeNumber: body.episodeNumber || '',
    language: body.language || 'Khmer',
    recapStyle: body.recapStyle || 'Balanced',
    narrationTone: body.narrationTone || 'Suspenseful',
    targetDuration: body.targetDuration || '5 minutes',
    customDurationMinutes: body.customDurationMinutes,
    model: body.model || '3.8',
  };
}

function progressFor(job: AnalyzeJob): number {
  switch (job.state) {
    case 'pending':
      return 3;
    case 'uploading': {
      const ratio = job.uploadOffset && job.uploadSize ? job.uploadOffset / job.uploadSize : 0;
      return Math.min(60, 5 + Math.round(ratio * 55));
    }
    case 'processing':
      return 68;
    case 'generating':
      return 85;
    case 'done':
      return 100;
    default:
      return job.progress || 0;
  }
}

/* ------------------------------------------------------------------ routes */

export async function handleAnalyze(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const body = await readJson<AnalyzeBody>(request);
  const params = buildParams(body);

  if (!params.storedName) {
    return fail(400, 'storedName is required', request, env);
  }

  // The video must exist in R2.
  let size = 0;
  let storedDuration: number | undefined;
  try {
    const head = await headVideo(env, params.storedName);
    if (!head) {
      return fail(
        404,
        'Video file not found in storage. Upload it again (or run `npm run samples:upload` inside worker/ if you picked a demo sample).',
        request,
        env
      );
    }
    size = head.size;
    const hint = Number(head.customMetadata?.duration || 0);
    storedDuration = hint > 0 ? hint : undefined;
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    return fail(status, error instanceof Error ? error.message : 'Storage error', request, env);
  }

  if (size > GEMINI_MAX_FILE_BYTES) {
    return fail(
      400,
      `This video is ${(size / (1024 * 1024 * 1024)).toFixed(2)} GB — Google's Files API accepts at most 2 GB per file.`,
      request,
      env
    );
  }

  const meta = await probeVideoMetadata(env, params.storedName, size, {
    duration: body.durationSec ?? storedDuration,
    width: body.width,
    height: body.height,
  });
  const realDuration = meta.duration && meta.duration > 0 ? meta.duration : 60;

  const { apiKey, source } = await resolveApiKey(request, env, body.apiKey);

  // --- No key: run the offline "Real-Video Story Engine" (same as server.ts) ---
  if (!apiKey) {
    const data = generateIntelligentRecapAnalysis({
      storedName: params.storedName,
      movieName: params.movieName,
      episodeNumber: params.episodeNumber,
      language: params.language,
      recapStyle: params.recapStyle,
      narrationTone: params.narrationTone,
      targetDuration: params.targetDuration,
      realDuration,
    });
    return ok(
      {
        data,
        generatedWith: 'real-video-engine',
        geminiNotice:
          'Generated with the built-in Real-Video Story Engine. Connect your Google AI Studio API key in Settings to activate Gemini Multimodal AI.',
      },
      request,
      env
    );
  }

  const job: AnalyzeJob = {
    id: newJobId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: 'pending',
    progress: 3,
    message: 'Starting Gemini analysis…',
    params,
    storedName: params.storedName,
    duration: realDuration,
    keySource: source as KeySource,
    uploadMimeType: mimeTypeForFilename(params.storedName),
    uploadOffset: 0,
    uploadSize: size,
  };

  // A bad/revoked key (or a Gemini outage) must not surface as a bare 500 —
  // park the job in `failed` so the client gets an actionable message.
  try {
    await advanceJob(env, ctx, job, apiKey, REQUEST_BUDGET_MS);
  } catch (error) {
    job.state = 'failed';
    job.error = error instanceof Error ? error.message : 'Failed to start the Gemini analysis.';
    await saveJob(env, job);
  }

  return ok(
    {
      jobId: job.id,
      state: job.state,
      progress: progressFor(job),
      message: job.message,
      duration: realDuration,
      metadataSource: meta.source,
      async: true,
      nextPollMs: 2000,
      ...(job.state === 'failed' ? { error: job.error } : {}),
    },
    request,
    env
  );
}

export async function handleAnalyzeJob(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  jobId: string
): Promise<Response> {
  const job = await loadJob(env, jobId);
  if (!job) {
    return fail(404, 'Analysis job not found or already expired. Please start the analysis again.', request, env);
  }

  if (job.state === 'done') {
    return ok(
      { jobId: job.id, state: 'done', progress: 100, message: job.message, data: job.data, geminiNotice: job.geminiNotice },
      request,
      env
    );
  }

  if (job.state === 'failed') {
    return ok({ jobId: job.id, state: 'failed', progress: 100, error: job.error }, request, env);
  }

  // The key is never persisted for caller-supplied keys, so it must come back
  // with every poll (the React app re-sends it automatically).
  const body = await readJson<{ apiKey?: string }>(request);
  const { apiKey } = await resolveApiKey(request, env, body.apiKey);

  if (!apiKey) {
    if (job.keySource === 'request') {
      return fail(
        401,
        'The Gemini API key used to start this analysis was not resent with this request. Include it in the `x-gemini-api-key` header (the app does this automatically) or connect the key again in Settings.',
        request,
        env
      );
    }
    job.state = 'failed';
    job.error = 'No Gemini API key available to continue this analysis.';
    await saveJob(env, job);
    return ok({ jobId: job.id, state: 'failed', error: job.error }, request, env);
  }

  try {
    await advanceJob(env, ctx, job, apiKey, REQUEST_BUDGET_MS);
  } catch (error) {
    job.state = 'failed';
    job.error = error instanceof Error ? error.message : 'Analysis failed.';
    await saveJob(env, job);
  }

  // `advanceJob` can move the job to a terminal state, which TypeScript cannot
  // see from the narrowing above — read the state as a string for the payload.
  const state: string = job.state;

  return ok(
    {
      jobId: job.id,
      state,
      progress: progressFor(job),
      message: job.message,
      nextPollMs: state === 'uploading' ? 1000 : 2500,
      ...(state === 'done' ? { data: job.data, geminiNotice: job.geminiNotice } : {}),
      ...(state === 'failed' ? { error: job.error } : {}),
    },
    request,
    env
  );
}

/* ------------------------------------------------------------- job engine */

async function advanceJob(
  env: Env,
  ctx: ExecutionContext,
  job: AnalyzeJob,
  apiKey: string,
  budgetMs: number
): Promise<void> {
  if (inFlightJobs.has(job.id)) return;
  inFlightJobs.add(job.id);

  const deadline = Date.now() + budgetMs;
  let dirty = false;
  /** Set by a step that needs to run something after the job state is persisted. */
  let backgroundTask: (() => Promise<void>) | null = null;

  try {
    if (job.state === 'pending') {
      dirty = await startUpload(job, apiKey);
    } else if (job.state === 'uploading') {
      dirty = await pumpUpload(env, job, deadline);
    } else if (job.state === 'processing') {
      dirty = await pollProcessing(job, apiKey, deadline);
    } else if (job.state === 'generating') {
      const result = await maybeGenerate(env, job, apiKey);
      dirty = result.dirty;
      backgroundTask = result.backgroundTask;
    }

    if (dirty) {
      job.progress = progressFor(job);
      await saveJob(env, job);
    }
  } finally {
    inFlightJobs.delete(job.id);
  }

  // Kick off the (long) generation only after the job row is safely persisted,
  // otherwise the background write could be overwritten by the save above.
  if (backgroundTask) {
    ctx.waitUntil(backgroundTask());
  }
}

/** Step 1 — open a Gemini resumable-upload session. */
async function startUpload(job: AnalyzeJob, apiKey: string): Promise<boolean> {
  const mimeType = job.uploadMimeType || 'video/mp4';
  job.message = 'Opening Gemini upload session…';
  const uploadUrl = await startResumableUpload(
    apiKey,
    job.uploadSize || 0,
    mimeType,
    job.params.movieName || job.storedName
  );
  job.uploadUrl = uploadUrl;
  job.uploadOffset = 0;
  job.state = 'uploading';
  job.message = 'Uploading video to Gemini…';
  return true;
}

/** Step 2 — stream chunks from R2 into the Gemini upload session. */
async function pumpUpload(env: Env, job: AnalyzeJob, deadline: number): Promise<boolean> {
  if (!job.uploadUrl) {
    job.state = 'pending';
    return true;
  }

  let dirty = false;
  const total = job.uploadSize || 0;

  while (Date.now() < deadline && (job.uploadOffset || 0) < total) {
    const offset = job.uploadOffset || 0;
    const chunk = await readVideoSlice(env, job.storedName, offset, UPLOAD_CHUNK_BYTES);
    if (!chunk || chunk.length === 0) {
      throw new ApiError(500, 'Unable to read the stored video while uploading it to Gemini.');
    }

    const isFinal = offset + chunk.length >= total;
    const file = await uploadChunk(job.uploadUrl, chunk, offset, isFinal);

    job.uploadOffset = offset + chunk.length;
    dirty = true;

    if (isFinal && file) {
      job.geminiFileName = file.name;
      job.geminiFileUri = file.uri;
      job.state = 'processing';
      job.message = 'Gemini is processing the video…';
      job.uploadUrl = undefined;
      break;
    }

    const percent = total ? Math.round((job.uploadOffset / total) * 100) : 0;
    job.message = `Uploading video to Gemini… ${percent}%`;
  }

  return dirty;
}

/** Step 3 — wait until Google reports the uploaded file as ACTIVE. */
async function pollProcessing(job: AnalyzeJob, apiKey: string, deadline: number): Promise<boolean> {
  if (!job.geminiFileName) {
    throw new ApiError(500, 'Gemini upload finished without a file reference.');
  }

  job.message = 'Gemini is analysing the video…';
  let dirty = false;

  while (Date.now() < deadline) {
    const file = await getFile(apiKey, job.geminiFileName);

    if (file.state === 'ACTIVE') {
      job.geminiFileUri = file.uri;
      job.state = 'generating';
      job.message = 'Writing your recap script with Gemini…';
      return true;
    }

    if (file.state === 'FAILED') {
      throw new ApiError(502, file.error?.message || 'Gemini video processing failed on Google server.');
    }

    dirty = true;
    await sleep(3000);
  }

  return dirty;
}

/** Step 4 — run generateContent in the background and persist the result. */
async function maybeGenerate(
  env: Env,
  job: AnalyzeJob,
  apiKey: string
): Promise<{ dirty: boolean; backgroundTask: (() => Promise<void>) | null }> {
  const startedAt = job.generationStartedAt || 0;
  const elapsed = Date.now() - startedAt;

  if (startedAt && elapsed < GENERATION_STALL_MS) {
    // Still running in the background — report progress, don't touch storage.
    job.message = `Gemini is writing the recap script… (${Math.round(elapsed / 1000)}s)`;
    return { dirty: false, backgroundTask: null };
  }

  const attempts = job.generationAttempts || 0;
  if (attempts >= MAX_GENERATION_ATTEMPTS) {
    // Both attempts stalled — fall back to the local engine so the user still
    // gets a usable (clearly labelled) result instead of an endless spinner.
    job.data = generateIntelligentRecapAnalysis({
      storedName: job.storedName,
      movieName: job.params.movieName,
      episodeNumber: job.params.episodeNumber,
      language: job.params.language,
      recapStyle: job.params.recapStyle,
      narrationTone: job.params.narrationTone,
      targetDuration: job.params.targetDuration,
      realDuration: job.duration,
    });
    job.state = 'done';
    job.message = 'Analysis complete (offline engine).';
    job.geminiNotice =
      'Gemini did not answer in time, so the built-in Real-Video Story Engine produced this draft. Try again, or use a shorter clip.';
    return { dirty: true, backgroundTask: null };
  }

  job.generationAttempts = attempts + 1;
  job.generationStartedAt = Date.now();
  job.message = 'Gemini is writing the recap script…';

  return {
    dirty: true,
    backgroundTask: async () => {
      await runGeneration(env, job, apiKey);
    },
  };
}

/**
 * The long-running call. Executed via `ctx.waitUntil()` — it outlives the HTTP
 * response, and writes its outcome straight into the job row.
 */
async function runGeneration(env: Env, job: AnalyzeJob, apiKey: string): Promise<void> {
  const systemInstruction = buildSystemInstruction(job.params, job.duration);
  const userPrompt = buildUserPrompt(job.params);
  const schema = recapResponseSchema();
  const models = candidateModels(job.params.model);

  let lastError: unknown = null;

  for (const model of models) {
    try {
      const result = await generateContent({
        apiKey,
        model,
        systemInstruction,
        userPrompt,
        fileUri: job.geminiFileUri,
        fileMimeType: job.uploadMimeType,
        responseSchema: schema,
        temperature: 0.2,
      });

      const parsed = normalizeAnalysis(JSON.parse(result.text) as Record<string, unknown>);
      job.data = parsed;
      job.state = 'done';
      job.message = 'Analysis complete!';
      job.progress = 100;
      job.finishReason = result.finishReason;
      job.generationStartedAt = undefined;
      await saveJob(env, job);
      await releaseGeminiFile(apiKey, job);
      return;
    } catch (error) {
      lastError = error;
      // Try the next candidate model (mirrors the retry loop in server.ts).
    }
  }

  // Every model failed — same graceful degradation as the Express server.
  const message = lastError instanceof Error ? lastError.message : 'Unknown Gemini error';
  job.data = generateIntelligentRecapAnalysis({
    storedName: job.storedName,
    movieName: job.params.movieName,
    episodeNumber: job.params.episodeNumber,
    language: job.params.language,
    recapStyle: job.params.recapStyle,
    narrationTone: job.params.narrationTone,
    targetDuration: job.params.targetDuration,
    realDuration: job.duration,
  });
  job.state = 'done';
  job.progress = 100;
  job.message = 'Analysis complete (offline engine).';
  job.geminiNotice = `Gemini API note: ${message}`;
  job.generationStartedAt = undefined;
  await saveJob(env, job);
  await releaseGeminiFile(apiKey, job);
}

async function releaseGeminiFile(apiKey: string, job: AnalyzeJob): Promise<void> {
  if (!job.geminiFileName) return;
  await deleteFile(apiKey, job.geminiFileName);
  job.geminiFileName = undefined;
}
