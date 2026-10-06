/**
 * Gemini API-key resolution.
 *
 * `server.ts` used `process.env.GEMINI_API_KEY` mutated at runtime, which is not
 * possible on Workers (no writable global env, isolates are recycled). Instead
 * the key is resolved per request, in this priority order:
 *
 *   1. explicit body/header key sent by the browser   (`apiKey`, `x-gemini-api-key`)
 *   2. Worker secret / var                            (`env.GEMINI_API_KEY`)
 *   3. key previously saved from the Settings screen  (R2 `_config/…`)
 */

import type { Env } from '../types';
import { loadStoredApiKey } from './storage';

export type KeySource = 'request' | 'env' | 'stored';

export interface ResolvedKey {
  apiKey: string | null;
  source: KeySource | null;
}

const PLACEHOLDERS = new Set(['', 'MY_GEMINI_API_KEY', 'YOUR_API_KEY', 'undefined', 'null']);

export function looksLikeRealKey(key?: string | null): boolean {
  return Boolean(key && !PLACEHOLDERS.has(key.trim()));
}

export function readRequestApiKey(request: Request, bodyKey?: unknown): string | null {
  if (typeof bodyKey === 'string' && looksLikeRealKey(bodyKey)) return bodyKey.trim();
  const headerKey = request.headers.get('x-gemini-api-key');
  if (looksLikeRealKey(headerKey)) return headerKey!.trim();
  return null;
}

export function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}••••••••${key.slice(-4)}` : '••••••••';
}

/**
 * Resolves the key without touching the network.
 * `strict` also reports whether the key came from the caller (needed for job
 * polling, where the browser must keep sending its key).
 */
export async function resolveApiKey(
  request: Request,
  env: Env,
  bodyKey?: unknown
): Promise<ResolvedKey> {
  const requestKey = readRequestApiKey(request, bodyKey);
  if (requestKey) return { apiKey: requestKey, source: 'request' };

  if (looksLikeRealKey(env.GEMINI_API_KEY)) {
    return { apiKey: env.GEMINI_API_KEY!.trim(), source: 'env' };
  }

  const stored = await loadStoredApiKey(env);
  if (looksLikeRealKey(stored)) return { apiKey: stored!.trim(), source: 'stored' };

  return { apiKey: null, source: null };
}


