/**
 * POST /api/upload — stores a video in R2.
 *
 * Differences from the Express version (which used multer + disk):
 *   - the file is streamed straight into R2 instead of being written to `uploads/`
 *   - `ffprobe` is gone, so duration / dimensions come from the browser (sent as
 *     multipart fields) and fall back to parsing the MP4 `moov` atom.
 *
 * Two request shapes are accepted:
 *   1. multipart/form-data  (what the React app sends — `video` field + metadata)
 *   2. raw binary body      (any `video/*` content type, metadata in the query
 *                            string) — handy for large files and other clients
 */

import type { Env, VideoInfo } from '../types';
import { ok, fail } from '../lib/http';
import { isMultipart, openMultipartFile } from '../lib/multipart';
import { putVideo, putVideoStream } from '../lib/storage';
import { mimeTypeForFilename, probeVideoMetadata } from '../lib/videoMeta';
import { cleanVideoTitle } from '../lib/titles';

/** Cloudflare rejects request bodies above this size before they reach the Worker. */
const MAX_REQUEST_BODY = 100 * 1024 * 1024;

function safeBaseName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '');
  const safe = withoutExtension.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return safe || 'video';
}

function extensionFor(filename: string, contentType: string): string {
  const match = /\.[a-zA-Z0-9]{2,5}$/.exec(filename || '');
  if (match) return match[0].toLowerCase();
  if (contentType.includes('webm')) return '.webm';
  if (contentType.includes('quicktime')) return '.mov';
  if (contentType.includes('x-matroska')) return '.mkv';
  return '.mp4';
}

function toNumber(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const declaredLength = toNumber(request.headers.get('content-length'));
  if (declaredLength && declaredLength > MAX_REQUEST_BODY) {
    return fail(
      413,
      `This file is ${(declaredLength / (1024 * 1024)).toFixed(1)} MB but Cloudflare Workers only accept request bodies up to 100 MB. Please trim the video, or import it from a direct URL (which streams into storage without this limit).`,
      request,
      env,
      { code: 'PAYLOAD_TOO_LARGE' }
    );
  }

  if (!request.body) return fail(400, 'No video file provided', request, env);

  const url = new URL(request.url);
  const multipartUpload = isMultipart(request);
  let filename: string;
  let contentType: string;
  let body: ReadableStream<Uint8Array>;
  let fields: Record<string, string> = {};

  try {
    if (multipartUpload) {
      const part = await openMultipartFile(request, 'video');
      filename = part.filename;
      contentType = part.contentType;
      body = part.stream;
      fields = part.fields;
    } else {
      const rawBody = request.body;
      filename = url.searchParams.get('filename') || `upload${extensionFor('', request.headers.get('Content-Type') || '')}`;
      contentType = request.headers.get('Content-Type') || mimeTypeForFilename(filename);
      body = rawBody;
    }
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : 'Invalid upload body', request, env);
  }

  const finalMime = contentType && contentType !== 'application/octet-stream' ? contentType : mimeTypeForFilename(filename);
  const extension = extensionFor(filename, finalMime);
  const storedName = `${safeBaseName(filename)}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

  const hints = {
    duration: toNumber(fields.durationSec) ?? toNumber(url.searchParams.get('durationSec')),
    width: toNumber(fields.width) ?? toNumber(url.searchParams.get('width')),
    height: toNumber(fields.height) ?? toNumber(url.searchParams.get('height')),
  };

  const objectMeta = {
    duration: hints.duration ? String(hints.duration) : '',
    width: hints.width ? String(hints.width) : '',
    height: hints.height ? String(hints.height) : '',
    clientName: filename,
  };

  try {
    // A streamed multipart file part has no known length, so it is assembled
    // with R2 multipart uploads; a raw body with Content-Length can be stored
    // in one shot.
    const stored = multipartUpload
      ? await putVideoStream(env, storedName, body, { contentType: finalMime, meta: objectMeta })
      : await putVideo(env, storedName, body, {
          contentType: finalMime,
          size: declaredLength ?? undefined,
          meta: objectMeta,
        });

    const meta = await probeVideoMetadata(env, storedName, stored.size, hints);
    const cleaned = cleanVideoTitle(filename);

    const fileInfo: VideoInfo = {
      fileName: filename,
      storedName,
      // Kept for frontend type compatibility; Workers have no filesystem.
      filePath: `r2://${storedName}`,
      mimeType: finalMime,
      size: stored.size,
      duration: meta.duration ?? hints.duration ?? 0,
      width: meta.width,
      height: meta.height,
      videoUrl: `/api/video/${storedName}`,
      detectedTitle: cleaned.title,
      detectedEpisode: cleaned.detectedEpisode,
      isSample: false,
    };

    return ok({ file: fileInfo, metadataSource: meta.source }, request, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store the uploaded video.';
    // `badRequest`-thrown errors already carry a usable message; R2 binding
    // problems surface as ApiError(503) from storage.requireBucket.
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      return fail(status, message, request, env);
    }
    return fail(500, message, request, env);
  }
}

/** Shared with the URL importer. */
export { safeBaseName, extensionFor, toNumber };
