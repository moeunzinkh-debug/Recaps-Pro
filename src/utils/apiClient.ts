import { VideoAnalysisData, VideoInfo } from '../types';

/**
 * Client for the Recap Studio AI backend.
 *
 * Works against either backend:
 *   - the local Express server (`server.ts`), which answers /api/analyze synchronously
 *   - the Cloudflare Worker (`worker/`), which answers with a jobId that has to be
 *     polled because Worker requests cannot stay open for minutes
 */

export type AnalyzeState =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'generating'
  | 'done'
  | 'failed';

export interface AnalyzeJobStatus {
  jobId: string;
  state: AnalyzeState | string;
  progress?: number;
  message?: string;
  data?: VideoAnalysisData;
  error?: string;
  geminiNotice?: string;
  nextPollMs?: number;
}

export interface AnalyzeStartResponse {
  success: boolean;
  data?: VideoAnalysisData;
  jobId?: string;
  state?: string;
  progress?: number;
  message?: string;
  geminiNotice?: string;
  error?: string;
}

const JOB_TIMEOUT_MS = 20 * 60 * 1000; // give up after 20 minutes
const MAX_NETWORK_RETRIES = 6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { 'x-gemini-api-key': apiKey } : {};
}

/** Starts an analysis. Returns either the result directly or a jobId to poll. */
export async function startAnalyze(
  payload: Record<string, unknown>,
  apiKey?: string
): Promise<AnalyzeStartResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(apiKey),
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as AnalyzeStartResponse;

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Video analysis failed. Please try again.');
  }

  // The Worker can fail the job immediately (e.g. an invalid Gemini key) — no
  // point polling for it in that case.
  if (data.state === 'failed') {
    throw new Error(data.error || 'Gemini analysis failed. Please check your API key in Settings.');
  }

  return data;
}

export interface PollAnalyzeOptions {
  jobId: string;
  apiKey?: string;
  onStatus?: (status: AnalyzeJobStatus) => void;
  signal?: AbortSignal;
}

/**
 * Polls `/api/analyze/job/:id` until the recap is ready.
 * The Worker advances the job one step per poll (upload → Gemini processing →
 * script generation), which is why the interval comes from the server.
 */
export async function pollAnalyzeJob(options: PollAnalyzeOptions): Promise<VideoAnalysisData> {
  const { jobId, apiKey, onStatus, signal } = options;
  const startedAt = Date.now();
  let networkErrors = 0;

  for (;;) {
    if (signal?.aborted) throw new Error('Analysis cancelled.');
    if (Date.now() - startedAt > JOB_TIMEOUT_MS) {
      throw new Error('Analysis timed out. Please try again with a shorter video.');
    }

    let status: AnalyzeJobStatus | null = null;

    try {
      const res = await fetch(`/api/analyze/job/${encodeURIComponent(jobId)}`, {
        headers: { ...authHeaders(apiKey) },
        signal,
      });
      const data = (await res.json().catch(() => ({}))) as AnalyzeJobStatus & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || `Analysis status check failed (HTTP ${res.status}).`);
      }
      status = data;
      networkErrors = 0;
    } catch (error) {
      if (signal?.aborted) throw error;
      networkErrors += 1;
      if (networkErrors > MAX_NETWORK_RETRIES) throw error;
      await sleep(3000);
      continue;
    }

    onStatus?.(status);

    if (status.state === 'done') {
      if (!status.data) throw new Error('Analysis finished but no recap data was returned.');
      return status.data;
    }

    if (status.state === 'failed') {
      throw new Error(status.error || 'Gemini analysis failed. Please try again.');
    }

    await sleep(Math.max(1000, Math.min(status.nextPollMs || 2500, 10000)));
  }
}

export interface UploadResult {
  file: VideoInfo;
  metadataSource?: string;
  sampleAvailable?: boolean;
  hint?: string;
}

/** POST /api/upload-url — imports a sample or a direct video URL. */
export async function importVideoFromUrl(url: string, title?: string): Promise<UploadResult> {
  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title }),
  });

  const data = (await res.json().catch(() => ({}))) as UploadResult & { success?: boolean; error?: string };
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to import the video URL.');
  }
  return data as UploadResult;
}

/**
 * Reads duration / dimensions in the browser.
 *
 * The Cloudflare Worker has no `ffprobe`, so these values are measured here and
 * sent along with the upload (the Worker also parses the MP4 `moov` atom as a
 * fallback for files it did not receive from a browser).
 */
export async function readVideoMetadataFromFile(
  file: File,
  timeoutMs = 8000
): Promise<{ duration?: number; width?: number; height?: number }> {
  if (typeof document === 'undefined') return {};

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (result: { duration?: number; width?: number; height?: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timer = setTimeout(() => finish({}), timeoutMs);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.addEventListener('loadedmetadata', () => {
      finish({
        duration: Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
      });
    });

    video.addEventListener('error', () => finish({}));

    video.src = objectUrl;
  });
}

export const WORKER_UPLOAD_LIMIT_MB = 100;
