/**
 * Video metadata without `ffprobe`.
 *
 * server.ts shelled out to `ffprobe` (`child_process`), which cannot run on
 * Workers. Instead the MP4/QuickTime `moov` atom is parsed straight out of R2:
 *
 *   - `mvhd`  -> duration (duration / timescale)
 *   - `tkhd`  -> width / height (16.16 fixed point)
 *
 * The browser also reports `duration` from `HTMLVideoElement` after upload; that
 * value is sent along with the file and takes priority because it is exact.
 */

import type { Env } from '../types';
import { readVideoSlice } from './storage';

export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  /** Where the numbers came from — handy while debugging. */
  source: 'client' | 'mp4-head' | 'mp4-tail' | 'stored' | 'none';
}

interface Box {
  type: string;
  start: number;
  end: number;
  contentStart: number;
}

const MOOV_SIGNATURE = [0x6d, 0x6f, 0x6f, 0x76]; // "moov"

function findSignature(bytes: Uint8Array, signature: number[], from = 0): number {
  outer: for (let i = from; i <= bytes.length - signature.length; i++) {
    for (let j = 0; j < signature.length; j++) {
      if (bytes[i + j] !== signature[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function iterateBoxes(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;

  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    let contentStart = offset + 8;

    if (size === 1) {
      if (offset + 16 > end) break;
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      contentStart = offset + 16;
    } else if (size === 0) {
      size = end - offset; // box runs to the end of the buffer
    }

    if (size < 8 || offset + size > end) break;

    boxes.push({ type, start: offset, end: offset + size, contentStart });
    offset += size;
  }

  return boxes;
}

/** Parses a buffer that contains a complete `moov` atom starting at `moovStart`. */
function parseMoov(bytes: Uint8Array, moovStart: number): { duration?: number; width?: number; height?: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const moovBox = iterateBoxes(view, moovStart, bytes.length).find((box) => box.type === 'moov');
  if (!moovBox) return {};

  const children = iterateBoxes(view, moovBox.contentStart, moovBox.end);
  let duration: number | undefined;
  let width: number | undefined;
  let height: number | undefined;

  const mvhd = children.find((box) => box.type === 'mvhd');
  if (mvhd && mvhd.contentStart + 20 <= mvhd.end) {
    const version = view.getUint8(mvhd.contentStart);
    const base = mvhd.contentStart + 4; // skip version + flags
    const timescale = version === 1 ? view.getUint32(base + 16) : view.getUint32(base + 8);
    const rawDuration =
      version === 1
        ? view.getUint32(base + 20) * 2 ** 32 + view.getUint32(base + 24)
        : view.getUint32(base + 12);

    if (timescale > 0 && rawDuration > 0) duration = rawDuration / timescale;
  }

  for (const trak of children.filter((box) => box.type === 'trak')) {
    const tkhd = iterateBoxes(view, trak.contentStart, trak.end).find((box) => box.type === 'tkhd');
    if (!tkhd || tkhd.end - 8 < tkhd.contentStart) continue;
    const w = view.getUint32(tkhd.end - 8) / 65536;
    const h = view.getUint32(tkhd.end - 4) / 65536;
    if (w > 0 && h > 0) {
      width = Math.round(w);
      height = Math.round(h);
      break;
    }
  }

  return { duration, width, height };
}

const HEAD_BYTES = 1024 * 1024;
const TAIL_BYTES = 512 * 1024;

/**
 * Reads the duration / dimensions of a stored video.
 *
 * @param hints values already known (e.g. reported by the browser on upload)
 */
export async function probeVideoMetadata(
  env: Env,
  storedName: string,
  size: number,
  hints: { duration?: number; width?: number; height?: number } = {}
): Promise<VideoMetadata> {
  const result: VideoMetadata = {
    duration: hints.duration && hints.duration > 0 ? hints.duration : undefined,
    width: hints.width && hints.width > 0 ? hints.width : undefined,
    height: hints.height && hints.height > 0 ? hints.height : undefined,
    source: hints.duration && hints.duration > 0 ? 'client' : 'none',
  };

  const needsDuration = !result.duration;
  const needsDimensions = !result.width || !result.height;
  if (!needsDuration && !needsDimensions) return result;

  // --- 1. moov at the front (faststart / most browser/ffmpeg exports) -----
  const headLength = Math.min(size || HEAD_BYTES, HEAD_BYTES);
  const head = await readVideoSlice(env, storedName, 0, headLength, size);
  if (head && head.length > 8) {
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const topLevel = iterateBoxes(view, 0, head.length);
    const moov = topLevel.find((box) => box.type === 'moov');
    if (moov) {
      const parsed = parseMoov(head, moov.start);
      if (parsed.duration) result.duration = parsed.duration;
      if (parsed.width && parsed.height) {
        result.width = parsed.width;
        result.height = parsed.height;
      }
      result.source = result.source === 'client' ? 'client' : 'mp4-head';
      if (result.duration && result.width) return result;
    }
  }

  // --- 2. moov at the end (non-faststart recordings) ----------------------
  if (size > headLength) {
    const tailLength = Math.min(size, TAIL_BYTES);
    const tail = await readVideoSlice(env, storedName, size - tailLength, tailLength, size);
    if (tail) {
      const moovIndex = findSignature(tail, MOOV_SIGNATURE);
      if (moovIndex >= 4) {
        // The 4 bytes before "moov" are the box size; walk back to the box start.
        const boxStart = moovIndex - 4;
        const parsed = parseMoov(tail, boxStart);
        if (!result.duration && parsed.duration) result.duration = parsed.duration;
        if (!result.width && parsed.width) {
          result.width = parsed.width;
          result.height = parsed.height;
        }
        if (result.source === 'none') result.source = 'mp4-tail';
      }
    }
  }

  if (result.duration) result.duration = Math.max(1, Math.round(result.duration));
  return result;
}

/** Maps a file name to the MIME type used for storage + the Gemini Files API. */
export function mimeTypeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.mpeg') || lower.endsWith('.mpg')) return 'video/mpeg';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/mp4';
}
