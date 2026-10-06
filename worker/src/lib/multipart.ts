/**
 * Streaming `multipart/form-data` reader.
 *
 * `multer` (used by server.ts) does not exist on Workers and `request.formData()`
 * buffers the whole file — which would blow the isolate memory limit for large
 * videos. This module parses the multipart envelope incrementally so the video
 * bytes go straight from the request body into R2 without buffering.
 *
 * Text fields that appear *before* the file part (the browser sends them first,
 * see UploadSection.tsx) are collected into `fields`.
 */

import { badRequest } from './errors';

const CRLF_BYTES = new Uint8Array([13, 10]);
const HEADER_END = new Uint8Array([13, 10, 13, 10]);
const DOUBLE_DASH = new Uint8Array([45, 45]);

function concatBytes(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfBytes(
  haystack: Uint8Array<ArrayBufferLike>,
  needle: Uint8Array<ArrayBufferLike>,
  from = 0
): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  outer: for (let i = Math.max(0, from); i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function encodeAscii(text: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function startsWith(bytes: Uint8Array<ArrayBufferLike>, prefix: Uint8Array<ArrayBufferLike>): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

const asciiDecoder = new TextDecoder('utf-8');

export function parseBoundary(contentType: string): string | null {
  const match = /boundary="?([^";]+)"?/i.exec(contentType || '');
  return match ? match[1] : null;
}

interface PartHeaders {
  name?: string;
  filename?: string;
  contentType?: string;
}

function parsePartHeaders(raw: string): PartHeaders {
  const headers: PartHeaders = {};
  for (const line of raw.split('\r\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (name === 'content-disposition') {
      const fieldName = /name="([^"]*)"/i.exec(value);
      const fileName = /filename="([^"]*)"/i.exec(value);
      if (fieldName) headers.name = fieldName[1];
      if (fileName) headers.filename = fileName[1];
    } else if (name === 'content-type') {
      headers.contentType = value;
    }
  }
  return headers;
}

export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  /** Byte stream of the file — consumed lazily, never fully buffered. */
  stream: ReadableStream<Uint8Array>;
  /** Plain text fields that were sent before the file part. */
  fields: Record<string, string>;
}

/**
 * Opens the first file part of a multipart body.
 *
 * The returned stream must be consumed (e.g. by `bucket.put()`), otherwise the
 * request body is never drained.
 */
export async function openMultipartFile(
  request: Request,
  wantedField = 'video'
): Promise<MultipartFile> {
  const contentType = request.headers.get('Content-Type') || '';
  const boundary = parseBoundary(contentType);
  if (!boundary || !request.body) {
    throw badRequest('Expected a multipart/form-data upload.');
  }

  const reader = request.body.getReader();
  const delimiter = concatBytes(CRLF_BYTES, encodeAscii(`--${boundary}`));
  const fields: Record<string, string> = {};

  let buffer = new Uint8Array(0);
  let ended = false;

  const readMore = async (): Promise<void> => {
    const { value, done } = await reader.read();
    if (done) {
      ended = true;
      return;
    }
    if (value && value.length) buffer = concatBytes(buffer, value);
  };

  const ensure = async (predicate: () => boolean): Promise<void> => {
    while (!predicate()) {
      if (ended) return;
      await readMore();
    }
  };

  const findHeaderEnd = (): number => indexOfBytes(buffer, HEADER_END);

  // --- 1. locate the first boundary marker -------------------------------
  const firstMarker = encodeAscii(`--${boundary}`);
  await ensure(() => indexOfBytes(buffer, firstMarker) !== -1);
  const firstIndex = indexOfBytes(buffer, firstMarker);
  if (firstIndex === -1) throw badRequest('Malformed multipart body: boundary not found.');
  buffer = buffer.slice(firstIndex + firstMarker.length);

  // --- 2. walk the parts until we find the requested file field ----------
  for (;;) {
    if (startsWith(buffer, DOUBLE_DASH)) {
      throw badRequest(`No "${wantedField}" file part found in the upload.`);
    }

    await ensure(() => buffer.length >= 2);
    if (startsWith(buffer, CRLF_BYTES)) buffer = buffer.slice(2);

    await ensure(() => findHeaderEnd() !== -1);
    const headerEnd = findHeaderEnd();
    if (headerEnd === -1) throw badRequest('Malformed multipart body: headers not terminated.');

    const headers = parsePartHeaders(asciiDecoder.decode(buffer.slice(0, headerEnd)));
    buffer = buffer.slice(headerEnd + HEADER_END.length);

    if (headers.name === wantedField && headers.filename) {
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          for (;;) {
            const index = indexOfBytes(buffer, delimiter);
            if (index !== -1) {
              if (index > 0) controller.enqueue(buffer.slice(0, index));
              controller.close();
              reader.cancel().catch(() => {});
              return;
            }
            if (ended) {
              // Unterminated part: flush the remainder rather than losing data.
              if (buffer.length) controller.enqueue(buffer);
              controller.close();
              return;
            }
            // Keep back enough bytes to detect a delimiter split across chunks.
            const safe = buffer.length - (delimiter.length - 1);
            if (safe > 0) {
              controller.enqueue(buffer.slice(0, safe));
              buffer = buffer.slice(safe);
              return;
            }
            await readMore();
          }
        },
        cancel() {
          reader.cancel().catch(() => {});
        },
      });

      return {
        fieldName: wantedField,
        filename: headers.filename,
        contentType: headers.contentType || 'video/mp4',
        stream,
        fields,
      };
    }

    // Consume this part's body (either a small text field, or an unwanted file).
    await ensure(() => indexOfBytes(buffer, delimiter) !== -1);
    const partEnd = indexOfBytes(buffer, delimiter);
    if (partEnd === -1) {
      throw badRequest(`No "${wantedField}" file part found in the upload.`);
    }

    if (headers.name && !headers.filename) {
      fields[headers.name] = asciiDecoder.decode(buffer.slice(0, partEnd)).trim();
    } else if (partEnd > 4 * 1024 * 1024) {
      // Sanity guard: don't silently buffer huge unexpected file parts.
      throw badRequest('Unexpected large file part in the upload body.');
    }

    buffer = buffer.slice(partEnd + delimiter.length);
  }
}

/** True when the request carries a multipart body. */
export function isMultipart(request: Request): boolean {
  return /multipart\/form-data/i.test(request.headers.get('Content-Type') || '');
}
