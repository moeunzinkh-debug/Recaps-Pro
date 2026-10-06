/**
 * GET|HEAD /api/video/:filename — streams a stored video with HTTP Range support.
 *
 * Replaces the `fs.createReadStream` implementation in server.ts. R2 supports
 * byte-range reads natively, so seeking in the HTML5 player keeps working
 * (206 Partial Content + `Content-Range`).
 */

import type { Env } from '../types';
import { corsHeaders, fail } from '../lib/http';
import { getVideo, headVideo } from '../lib/storage';
import { mimeTypeForFilename } from '../lib/videoMeta';

interface ParsedRange {
  offset: number;
  length?: number;
  suffix?: number;
  /** Inclusive end byte, resolved once the object size is known. */
  endInclusive?: number;
}

function parseRangeHeader(rangeHeader: string | null, size: number): ParsedRange | null | 'invalid' {
  if (!rangeHeader) return null;
  const match = /^bytes=(.*)$/i.exec(rangeHeader.trim());
  if (!match) return 'invalid';

  const [startPart, endPart] = match[1].split('-').map((value) => value.trim());

  // Suffix form: bytes=-500 (last 500 bytes)
  if (!startPart && endPart) {
    const suffix = Number(endPart);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid';
    return { offset: 0, suffix };
  }

  const start = Number(startPart);
  if (!Number.isFinite(start) || start < 0 || start >= size) return 'invalid';

  if (!endPart) {
    // Open-ended: bytes=1000-
    return { offset: start, length: size - start, endInclusive: size - 1 };
  }

  const end = Number(endPart);
  if (!Number.isFinite(end) || end < start) return 'invalid';

  const clampedEnd = Math.min(end, size - 1);
  return { offset: start, length: clampedEnd - start + 1, endInclusive: clampedEnd };
}

function baseHeaders(request: Request, env: Env, mimeType: string, size: number, etag?: string): Headers {
  const headers = new Headers({
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
  });
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, value);
  }
  if (etag) headers.set('ETag', etag);
  headers.set('Content-Length', String(size));
  return headers;
}

export async function handleVideo(
  request: Request,
  env: Env,
  rawFilename: string
): Promise<Response> {
  const filename = decodeURIComponent(rawFilename || '').replace(/^\/+/, '');
  if (!filename || filename.includes('..')) {
    return fail(400, 'Invalid file name', request, env);
  }

  let size: number;
  let etag: string | undefined;
  try {
    const head = await headVideo(env, filename);
    if (!head) return fail(404, 'Video not found', request, env);
    size = head.size;
    etag = head.httpEtag;
  } catch (error) {
    return fail(
      (error as { status?: number }).status || 500,
      error instanceof Error ? error.message : 'Storage error',
      request,
      env
    );
  }

  const mimeType = mimeTypeForFilename(filename);
  const rangeHeader = request.headers.get('Range') || (request.headers.get('range') as string | null);
  const parsed = parseRangeHeader(rangeHeader, size);

  const wantsDownload = new URL(request.url).searchParams.get('download') === '1';
  const disposition: Record<string, string> = wantsDownload
    ? { 'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"` }
    : {};

  // Unsatisfiable range
  if (parsed === 'invalid') {
    const headers = baseHeaders(request, env, mimeType, size, etag);
    headers.set('Content-Range', `bytes */${size}`);
    for (const [key, value] of Object.entries(disposition)) headers.set(key, value);
    return new Response(null, { status: 416, headers });
  }

  // Full file (no Range header)
  if (!parsed) {
    if (request.method === 'HEAD') {
      const headers = baseHeaders(request, env, mimeType, size, etag);
      for (const [key, value] of Object.entries(disposition)) headers.set(key, value);
      return new Response(null, { status: 200, headers });
    }

    const object = await getVideo(env, filename);
    if (!object) return fail(404, 'Video not found', request, env);

    const headers = baseHeaders(request, env, mimeType, size, etag);
    for (const [key, value] of Object.entries(disposition)) headers.set(key, value);
    return new Response(object.body, { status: 200, headers });
  }

  // Partial content
  const object = await getVideo(env, filename, {
    offset: parsed.offset,
    length: parsed.length,
    suffix: parsed.suffix,
  });
  if (!object) return fail(416, 'Requested range not satisfiable', request, env);

  const start = parsed.suffix !== undefined ? Math.max(0, size - parsed.suffix) : parsed.offset;
  const end = parsed.endInclusive !== undefined ? parsed.endInclusive : size - 1;
  const length = parsed.suffix !== undefined ? size - start : (parsed.length ?? end - start + 1);

  const headers = baseHeaders(request, env, mimeType, length, etag);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  for (const [key, value] of Object.entries(disposition)) headers.set(key, value);

  if (request.method === 'HEAD') {
    return new Response(null, { status: 206, headers });
  }

  return new Response(object.body, { status: 206, headers });
}
