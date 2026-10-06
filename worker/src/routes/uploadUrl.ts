/**
 * POST /api/upload-url — imports a video from a direct URL into R2.
 *
 * Ported from server.ts: sample-video shortcuts, the YouTube block, then a
 * streamed download. The download is piped into R2 instead of `fs.writeFileSync`,
 * so a large file never has to fit in the isolate's memory.
 */

import type { Env, VideoInfo } from '../types';
import { ok, fail, readJson } from '../lib/http';
import { DEMO_SAMPLES } from '../lib/samples';
import { headVideo, putVideo, putVideoStream } from '../lib/storage';
import { mimeTypeForFilename, probeVideoMetadata } from '../lib/videoMeta';
import { extensionFor, safeBaseName } from './upload';

/** Gemini accepts files up to 2 GB; the rest is a safety valve for the Worker. */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;

export async function handleUploadUrl(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ url?: string; title?: string; durationSec?: number }>(request);
  const url = body.url;
  const title = body.title;

  if (!url || typeof url !== 'string') {
    return fail(400, 'Valid URL is required', request, env);
  }

  const lowerUrl = url.toLowerCase();

  // --- 1. internal demo samples -----------------------------------------
  const matchedSample = DEMO_SAMPLES.find(
    (sample) =>
      sample.url === url ||
      sample.id === url ||
      sample.storedName === url ||
      lowerUrl.includes(sample.id) ||
      lowerUrl.includes(sample.storedName) ||
      (sample.id === 'sample-sintel' && lowerUrl.includes('sintel')) ||
      (sample.id === 'sample-tears' && lowerUrl.includes('tears')) ||
      (sample.id === 'sample-bunny' && lowerUrl.includes('bunny'))
  );

  if (matchedSample) {
    const object = await headVideo(env, matchedSample.storedName).catch(() => null);
    const fileInfo: VideoInfo = {
      fileName: `${matchedSample.title}.mp4`,
      storedName: matchedSample.storedName,
      filePath: `r2://${matchedSample.storedName}`,
      mimeType: 'video/mp4',
      size: object?.size ?? 0,
      duration: matchedSample.durationSec,
      videoUrl: matchedSample.url,
      isSample: true,
      detectedTitle: matchedSample.title,
      detectedType: matchedSample.type,
    };

    return ok(
      {
        file: fileInfo,
        // Makes a missing demo upload obvious instead of failing later in analyze.
        sampleAvailable: Boolean(object),
        hint: object
          ? undefined
          : 'Sample video not found in the R2 bucket. Run `npm run samples:upload` inside worker/ to copy the curated demo clips into the bucket.',
      },
      request,
      env
    );
  }

  // --- 2. YouTube is blocked by bot protection --------------------------
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return fail(
      400,
      'YouTube enforces cloud bot protection (HTTP 403 Forbidden) against cloud servers. Please download your YouTube video to your device, then use [Drag & Drop] or [Choose Video] to upload it directly for Gemini analysis!',
      request,
      env
    );
  }

  // --- 3. direct video URL ----------------------------------------------
  try {
    const parsedUrl = new URL(url);
    const extension = extensionFor(parsedUrl.pathname, mimeTypeForFilename(parsedUrl.pathname));

    const remote = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'video/*,*/*;q=0.9',
      },
    });

    if (!remote.ok) {
      if (remote.status === 403) {
        return fail(
          400,
          'Video host blocked cloud server download (HTTP 403 Forbidden). Please download the video directly to your device and use [Choose Video] or drag and drop to upload!',
          request,
          env
        );
      }
      return fail(
        400,
        `Remote video host returned status ${remote.status} ${remote.statusText}`,
        request,
        env
      );
    }

    const remoteLength = Number(remote.headers.get('content-length') || 0);
    if (remoteLength && remoteLength > MAX_IMPORT_BYTES) {
      return fail(400, 'Remote video is larger than the 2 GB Gemini limit.', request, env);
    }
    if (!remote.body) {
      return fail(400, 'Remote video host returned an empty body.', request, env);
    }

    const baseName = safeBaseName(title || parsedUrl.pathname.split('/').pop() || 'direct_video');
    const storedName = `${baseName}-${Date.now()}${extension}`;
    const remoteMime = remote.headers.get('content-type')?.split(';')[0] || mimeTypeForFilename(storedName);

    // Remote hosts do not always send Content-Length; fall back to a streamed
    // (multipart) upload in that case so large files still import.
    const stored = remoteLength
      ? await putVideo(env, storedName, remote.body, {
          contentType: remoteMime,
          size: remoteLength,
          meta: { sourceUrl: url.slice(0, 400) },
        })
      : await putVideoStream(env, storedName, remote.body, {
          contentType: remoteMime,
          meta: { sourceUrl: url.slice(0, 400) },
        });

    const hints = { duration: body.durationSec && body.durationSec > 0 ? body.durationSec : undefined };
    const meta = await probeVideoMetadata(env, storedName, stored.size, hints);

    const fileInfo: VideoInfo = {
      fileName: title ? `${title}${extension}` : parsedUrl.pathname.split('/').pop() || storedName,
      storedName,
      filePath: `r2://${storedName}`,
      mimeType: remoteMime,
      size: stored.size,
      duration: meta.duration ?? 0,
      width: meta.width,
      height: meta.height,
      videoUrl: `/api/video/${storedName}`,
      isSample: false,
    };

    return ok({ file: fileInfo, metadataSource: meta.source }, request, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Access error';
    return fail(400, `Could not download video URL: ${message}. Please upload the video file directly!`, request, env);
  }
}
