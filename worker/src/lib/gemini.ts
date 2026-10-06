/**
 * Gemini REST client for the Workers runtime.
 *
 * Why not `@google/genai`? The SDK targets Node (it pulls in `node:` builtins,
 * buffering helpers and a writable `process.env`) and re-uploads files from a
 * filesystem path, none of which exist on Workers. The REST surface used here
 * is the same one the SDK wraps:
 *
 *   POST /upload/v1beta/files            (resumable session: `start`)
 *   POST <upload-url>                    (`upload`, `upload, finalize`)
 *   GET  /v1beta/files/{id}              (processing state)
 *   DELETE /v1beta/files/{id}
 *   POST /v1beta/models/{model}:generateContent
 */

/** 8 MiB — Google requires resumable chunks to be a multiple of 256 KiB. */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com';

/**
 * Base URL for the Gemini API. Overridable with the `GEMINI_API_BASE` var so a
 * deployment can route through a proxy/gateway — and so the job engine can be
 * smoke-tested offline (see worker/test/mock-gemini.mjs).
 */
let apiBase = DEFAULT_API_BASE;

export function configureGeminiBaseUrl(baseUrl?: string): void {
  apiBase = (baseUrl || DEFAULT_API_BASE).replace(/\/+$/, '');
}

export function geminiBaseUrl(): string {
  return apiBase;
}

export class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

interface GeminiFetchOptions extends RequestInit {
  apiKey: string;
}

async function geminiFetch(url: string, options: GeminiFetchOptions): Promise<Response> {
  const { apiKey, headers, ...rest } = options;
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set('x-goog-api-key', apiKey);

  const response = await fetch(url, { ...rest, headers: mergedHeaders });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new GeminiError(response.status, message);
  }
  return response;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed?.error?.message) return parsed.error.message;
    } catch {
      /* not JSON */
    }
    return text || `Google API returned status ${response.status}`;
  } catch {
    return `Google API returned status ${response.status}`;
  }
}

/** Validates a key by listing models — the same check the Express server did. */
export async function verifyApiKey(apiKey: string): Promise<void> {
  const response = await fetch(`${apiBase}/v1beta/models?pageSize=1`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!response.ok) {
    throw new GeminiError(response.status, await readErrorMessage(response));
  }
}

export interface GeminiFile {
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes?: string;
  state?: 'PROCESSING' | 'ACTIVE' | 'FAILED';
  error?: { message?: string };
}

/** Step 1 of the resumable protocol: obtains the upload session URL. */
export async function startResumableUpload(
  apiKey: string,
  fileSize: number,
  mimeType: string,
  displayName: string
): Promise<string> {
  const response = await geminiFetch(`${apiBase}/upload/v1beta/files`, {
    apiKey,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(fileSize),
      'X-Goog-Upload-Header-Content-Type': mimeType,
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });

  const uploadUrl = response.headers.get('X-Goog-Upload-URL') || response.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new GeminiError(502, 'Gemini did not return an upload URL for the resumable session.');
  }
  return uploadUrl;
}

/**
 * Step 2: sends one chunk. The last chunk must use `upload, finalize`, which
 * returns the created file resource.
 */
export async function uploadChunk(
  uploadUrl: string,
  chunk: Uint8Array,
  offset: number,
  isFinal: boolean
): Promise<GeminiFile | null> {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(chunk.length),
      'X-Goog-Upload-Offset': String(offset),
      'X-Goog-Upload-Command': isFinal ? 'upload, finalize' : 'upload',
    },
    body: chunk,
  });

  if (!response.ok) {
    throw new GeminiError(response.status, await readErrorMessage(response));
  }

  if (!isFinal) return null;

  const payload = (await response.json()) as { file?: GeminiFile } & GeminiFile;
  return payload.file || payload;
}

/** Polls the processing state of an uploaded file. */
export async function getFile(apiKey: string, fileName: string): Promise<GeminiFile> {
  const normalized = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
  const response = await geminiFetch(`${apiBase}/v1beta/${normalized}`, { apiKey, method: 'GET' });
  return (await response.json()) as GeminiFile;
}

export async function deleteFile(apiKey: string, fileName: string): Promise<void> {
  const normalized = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
  try {
    await geminiFetch(`${apiBase}/v1beta/${normalized}`, { apiKey, method: 'DELETE' });
  } catch {
    /* best effort: files expire on their own after 48h */
  }
}

export interface GenerateOptions {
  apiKey: string;
  model: string;
  systemInstruction: string;
  userPrompt: string;
  fileUri?: string;
  fileMimeType?: string;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  /** Plain-text generation (used by /api/refine-script). */
  textOnly?: string;
}

export interface GenerateResult {
  text: string;
  finishReason?: string;
}

export async function generateContent(options: GenerateOptions): Promise<GenerateResult> {
  const parts: Record<string, unknown>[] = [];
  if (options.fileUri) {
    parts.push({ file_data: { mime_type: options.fileMimeType || 'video/mp4', file_uri: options.fileUri } });
  }
  parts.push({ text: options.textOnly ?? options.userPrompt });

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      ...(options.responseSchema
        ? { responseMimeType: 'application/json', responseSchema: options.responseSchema }
        : {}),
    },
  };

  if (options.systemInstruction) {
    body.systemInstruction = { parts: [{ text: options.systemInstruction }] };
  }

  const response = await geminiFetch(`${apiBase}/v1beta/models/${options.model}:generateContent`, {
    apiKey: options.apiKey,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (payload.promptFeedback?.blockReason) {
    throw new GeminiError(400, `Gemini blocked the request (${payload.promptFeedback.blockReason}).`);
  }

  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new GeminiError(
      502,
      `Gemini returned an empty response${candidate?.finishReason ? ` (finishReason: ${candidate.finishReason})` : ''}.`
    );
  }

  return { text, finishReason: candidate?.finishReason };
}

/**
 * Model fallback chain — mirrors server.ts, where a requested model could fail
 * (quota, availability) and the next candidate was tried automatically.
 */
export function candidateModels(model?: string): string[] {
  switch (model) {
    case '3.8':
      return ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
    case '3.7':
      return ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash'];
    case '3.6':
      return ['gemini-2.5-flash', 'gemini-flash-latest'];
    case '3.5':
      return ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    default:
      if (typeof model === 'string' && model.startsWith('gemini-')) {
        return [model, 'gemini-2.5-flash'];
      }
      return ['gemini-3.8-flash', 'gemini-2.5-flash'];
  }
}
