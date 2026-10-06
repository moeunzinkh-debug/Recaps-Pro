/**
 * API-key endpoints.
 *
 * server.ts wrote the verified key into `process.env.GEMINI_API_KEY`, which does
 * not exist on Workers. The verified key is therefore:
 *   - stored in the R2 bucket (`_config/gemini-api-key.json`) when a bucket is
 *     bound, so it survives isolate recycling and applies to every visitor; or
 *   - kept in the isolate for the current lifetime when no bucket is available
 *     (the browser also keeps it in localStorage and re-sends it per request,
 *     so the app keeps working either way).
 */

import type { Env } from '../types';
import { json, ok, fail, readJson } from '../lib/http';
import { maskKey, looksLikeRealKey } from '../lib/keys';
import { deleteStoredApiKey, loadStoredApiKey, saveStoredApiKey } from '../lib/storage';
import { verifyApiKey, GeminiError } from '../lib/gemini';

const memoryStore = new Map<string, string>();

function memoryKey(): string | null {
  const key = memoryStore.get('GEMINI_API_KEY');
  return looksLikeRealKey(key) ? key! : null;
}

/** Resolves the key that should be reported as "connected". */
export async function currentServerKey(env: Env): Promise<{ key: string | null; source: string | null }> {
  if (looksLikeRealKey(env.GEMINI_API_KEY)) {
    return { key: env.GEMINI_API_KEY!.trim(), source: 'env' };
  }
  const stored = await loadStoredApiKey(env);
  if (looksLikeRealKey(stored)) return { key: stored!, source: 'stored' };
  const inMemory = memoryKey();
  if (inMemory) return { key: inMemory, source: 'memory' };
  return { key: null, source: null };
}

export async function handleApiKeyStatus(request: Request, env: Env): Promise<Response> {
  const { key, source } = await currentServerKey(env);
  return json(
    {
      hasKey: Boolean(key),
      maskedKey: key ? maskKey(key) : null,
      source,
      /** The frontend can warn the user when nothing can be persisted server-side. */
      persistentStore: Boolean(env.VIDEO_BUCKET),
      uploadTransport: 'multipart',
    },
    { request, env }
  );
}

export async function handleSetApiKey(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ apiKey?: string | null }>(request);
  const apiKey = body.apiKey;

  // Remove
  if (apiKey === null || apiKey === undefined || apiKey === '' || apiKey === 'REMOVE') {
    memoryStore.delete('GEMINI_API_KEY');
    if (env.VIDEO_BUCKET) {
      try {
        await deleteStoredApiKey(env);
      } catch {
        /* ignore */
      }
    }
    return ok(
      { hasKey: false, maskedKey: null, message: 'Gemini API key removed from the server.' },
      request,
      env
    );
  }

  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    return fail(400, 'Please provide a valid API key string', request, env);
  }

  const cleanKey = apiKey.trim();

  // Verify against Google before saving — same behaviour as the Express server.
  try {
    await verifyApiKey(cleanKey);
  } catch (error) {
    const message =
      error instanceof GeminiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    return fail(
      400,
      `Gemini API Key verification failed: ${message}. Please ensure you are using an API key from https://aistudio.google.com/apikey`,
      request,
      env
    );
  }

  memoryStore.set('GEMINI_API_KEY', cleanKey);

  let persisted = false;
  if (env.VIDEO_BUCKET) {
    try {
      await saveStoredApiKey(env, cleanKey);
      persisted = true;
    } catch {
      persisted = false;
    }
  }

  return ok(
    {
      hasKey: true,
      maskedKey: maskKey(cleanKey),
      persisted,
      message: persisted
        ? 'Google Gemini API Key verified and saved to the R2 bucket successfully!'
        : 'Google Gemini API Key verified. No R2 bucket is bound, so it is active for this worker instance only — it is also kept in your browser and re-sent with each request.',
    },
    request,
    env
  );
}
