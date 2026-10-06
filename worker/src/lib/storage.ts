/**
 * R2 storage layer — this is what replaces the `uploads/` folder and the
 * `fs` / `multer` usage from server.ts.
 *
 * Layout inside the bucket:
 *   videos/<storedName>        uploaded video files (streamed, Range supported)
 *   jobs/<jobId>.json          long-running Gemini analysis jobs
 *   _config/gemini-api-key.json  optional API key saved from the Settings screen
 */

import type { AnalyzeJob, Env } from '../types';
import { ApiError } from './errors';

const VIDEO_PREFIX = 'videos/';
const JOB_PREFIX = 'jobs/';
const CONFIG_KEY = '_config/gemini-api-key.json';

/**
 * R2 requires every part except the last to be at least 5 MiB, so 8 MiB parts
 * are used for streamed uploads.
 */
const MULTIPART_PART_BYTES = 8 * 1024 * 1024;

/** Returns the bucket or throws a helpful, actionable error. */
export function requireBucket(env: Env): R2Bucket {
  if (!env.VIDEO_BUCKET) {
    throw new ApiError(
      503,
      'R2 bucket is not configured. Create one with `npx wrangler r2 bucket create recaps-pro-videos` and make sure the [[r2_buckets]] binding named VIDEO_BUCKET is present in worker/wrangler.toml, then redeploy.',
      { code: 'R2_NOT_BOUND' }
    );
  }
  return env.VIDEO_BUCKET;
}

export function videoKey(storedName: string): string {
  // Defensive: never allow path traversal out of the prefix.
  const safe = storedName.split('/').pop()!.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${VIDEO_PREFIX}${safe}`;
}

export interface StoredVideo {
  key: string;
  storedName: string;
  size: number;
  uploadedAt: number;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

/* ------------------------------------------------------------------ videos */

export async function putVideo(
  env: Env,
  storedName: string,
  body: ReadableStream | ArrayBuffer | Uint8Array | Blob,
  options: {
    contentType: string;
    size?: number;
    /** Metadata used to skip MP4 parsing when the client already knows the values. */
    meta?: Record<string, string>;
  }
): Promise<StoredVideo> {
  const bucket = requireBucket(env);
  const key = videoKey(storedName);

  const object = await bucket.put(key, body as ReadableStream, {
    httpMetadata: {
      contentType: options.contentType || 'video/mp4',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      originalName: storedName,
      uploadedAt: String(Date.now()),
      ...(options.meta || {}),
    },
  });

  return {
    key,
    storedName,
    size: object?.size ?? options.size ?? 0,
    uploadedAt: Date.now(),
    httpMetadata: object?.httpMetadata as R2HTTPMetadata | undefined,
    customMetadata: object?.customMetadata,
  };
}

/**
 * Streams a body of *unknown* length into R2.
 *
 * `bucket.put()` refuses readable streams without a known length (which is
 * exactly what a streamed multipart/form-data file part is), so the object is
 * assembled with an R2 multipart upload instead. Memory stays bounded at one
 * part (8 MiB) no matter how large the video is.
 */
export async function putVideoStream(
  env: Env,
  storedName: string,
  stream: ReadableStream<Uint8Array>,
  options: {
    contentType: string;
    meta?: Record<string, string>;
    partSize?: number;
  }
): Promise<StoredVideo> {
  const bucket = requireBucket(env);
  const key = videoKey(storedName);
  const partSize = options.partSize ?? MULTIPART_PART_BYTES;

  const multipart = await bucket.createMultipartUpload(key, {
    httpMetadata: {
      contentType: options.contentType || 'video/mp4',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      originalName: storedName,
      uploadedAt: String(Date.now()),
      ...(options.meta || {}),
    },
  });

  const parts: R2UploadedPart[] = [];
  let partNumber = 1;
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let total = 0;
  const reader = stream.getReader();

  const uploadPart = async (bytes: Uint8Array<ArrayBufferLike>): Promise<void> => {
    // `.slice()` guarantees an exact-size backing buffer, which keeps the type
    // happy across @cloudflare/workers-types versions.
    const exact = bytes.slice() as Uint8Array<ArrayBuffer>;
    const part = await multipart.uploadPart(partNumber, exact.buffer);
    parts.push(part);
    partNumber += 1;
    total += exact.byteLength;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || !value.length) continue;

      if (!buffer.length) {
        buffer = value;
      } else {
        const merged = new Uint8Array(buffer.length + value.length);
        merged.set(buffer, 0);
        merged.set(value, buffer.length);
        buffer = merged;
      }

      // Only full-size parts may be uploaded (all parts but the last must match
      // R2's minimum part size).
      while (buffer.length >= partSize) {
        await uploadPart(buffer.subarray(0, partSize));
        buffer = buffer.slice(partSize);
      }
    }

    if (buffer.length) await uploadPart(buffer);

    if (!parts.length) {
      // Zero-byte body: create an empty object so the key exists.
      const emptyPart = await multipart.uploadPart(1, new ArrayBuffer(0));
      parts.push(emptyPart);
    }

    const object = await multipart.complete(parts);

    return {
      key,
      storedName,
      size: object?.size ?? total,
      uploadedAt: Date.now(),
      httpMetadata: object?.httpMetadata as R2HTTPMetadata | undefined,
      customMetadata: object?.customMetadata,
    };
  } catch (error) {
    try {
      await multipart.abort();
    } catch {
      /* the upload may already be finished/aborted */
    }
    throw error;
  } finally {
    reader.releaseLock?.();
  }
}

export async function headVideo(env: Env, storedName: string): Promise<R2Object | null> {
  const bucket = requireBucket(env);
  return bucket.head(videoKey(storedName));
}

export async function getVideo(
  env: Env,
  storedName: string,
  range?: { offset: number; length?: number; suffix?: number }
): Promise<R2ObjectBody | null> {
  const bucket = requireBucket(env);
  const key = videoKey(storedName);

  if (!range) return bucket.get(key);

  if (range.suffix !== undefined) return bucket.get(key, { range: { suffix: range.suffix } });
  // Always send an explicit offset together with the length: it is the most
  // widely supported form (and avoids edge cases in the local R2 emulator).
  return range.length !== undefined
    ? bucket.get(key, { range: { offset: Math.max(0, range.offset), length: range.length } })
    : bucket.get(key, { range: { offset: Math.max(0, range.offset) } });
}

/**
 * Reads a byte window, tolerating ranges that fall outside the object.
 * Returns `null` when the object (or the range) is unavailable, so callers can
 * degrade gracefully instead of failing the whole request.
 */
export async function readVideoSlice(
  env: Env,
  storedName: string,
  offset: number,
  length: number,
  size?: number
): Promise<Uint8Array | null> {
  if (length <= 0) return new Uint8Array(0);

  const start = Math.max(0, Math.floor(offset));
  let window = Math.floor(length);

  if (size !== undefined && size > 0) {
    if (start >= size) return new Uint8Array(0);
    window = Math.min(window, size - start);
  }
  if (window <= 0) return new Uint8Array(0);

  try {
    const object = await getVideo(env, storedName, { offset: start, length: window });
    if (!object) return null;
    return new Uint8Array(await object.arrayBuffer());
  } catch {
    // Some deployments reject ranges without an offset — retry from the start
    // and slice in memory (only for small enough windows).
    try {
      const object = await getVideo(env, storedName);
      if (!object || object.size > 16 * 1024 * 1024) return null;
      const all = new Uint8Array(await object.arrayBuffer());
      return all.subarray(start, Math.min(all.length, start + window));
    } catch {
      return null;
    }
  }
}

/* -------------------------------------------------------------------- jobs */

export async function saveJob(env: Env, job: AnalyzeJob): Promise<void> {
  const bucket = requireBucket(env);
  job.updatedAt = Date.now();
  await bucket.put(`${JOB_PREFIX}${job.id}.json`, JSON.stringify(job), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function loadJob(env: Env, jobId: string): Promise<AnalyzeJob | null> {
  const bucket = requireBucket(env);
  const object = await bucket.get(`${JOB_PREFIX}${sanitizeJobId(jobId)}.json`);
  if (!object) return null;
  try {
    return JSON.parse(await object.text()) as AnalyzeJob;
  } catch {
    return null;
  }
}

export async function deleteJob(env: Env, jobId: string): Promise<void> {
  const bucket = requireBucket(env);
  try {
    await bucket.delete(`${JOB_PREFIX}${sanitizeJobId(jobId)}.json`);
  } catch {
    /* best effort */
  }
}

export function sanitizeJobId(jobId: string): string {
  return (jobId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export function newJobId(): string {
  const random = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${Date.now().toString(36)}-${hex}`;
}

/* ------------------------------------------------------ stored API key (opt) */

interface StoredKeyConfig {
  apiKey?: string;
  savedAt?: number;
}

export async function loadStoredApiKey(env: Env): Promise<string | null> {
  if (!env.VIDEO_BUCKET) return null;
  try {
    const object = await env.VIDEO_BUCKET.get(CONFIG_KEY);
    if (!object) return null;
    const config = JSON.parse(await object.text()) as StoredKeyConfig;
    const key = config.apiKey?.trim();
    return key ? key : null;
  } catch {
    return null;
  }
}

export async function saveStoredApiKey(env: Env, apiKey: string): Promise<void> {
  const bucket = requireBucket(env);
  await bucket.put(CONFIG_KEY, JSON.stringify({ apiKey, savedAt: Date.now() }), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function deleteStoredApiKey(env: Env): Promise<void> {
  const bucket = requireBucket(env);
  await bucket.delete(CONFIG_KEY);
}
