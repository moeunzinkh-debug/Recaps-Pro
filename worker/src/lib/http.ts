/**
 * Small HTTP helpers shared by every route.
 *
 * Workers use the standard `Request` / `Response` objects instead of Express'
 * `req` / `res`, so these helpers replace `res.json()`, `res.status().json()`
 * and the CORS middleware that `server.ts` got from Express.
 */

import type { Env } from '../types';

const BASE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
  'Access-Control-Allow-Headers':
    'Content-Type, Range, x-gemini-api-key, x-goog-upload-command, x-goog-upload-offset, x-goog-upload-protocol',
  'Access-Control-Max-Age': '86400',
};

/** Origins explicitly allowed in addition to the Worker's own origin. */
function extraAllowedOrigins(env: Env): string[] {
  if (!env.ALLOWED_ORIGINS) return [];
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Builds the CORS headers for a request.
 *
 * Same-origin requests (the normal, single-deployment case) simply echo the
 * request origin — that also keeps `wrangler dev` and the preview proxy working.
 * Cross-origin requests are only allowed when listed in `ALLOWED_ORIGINS`.
 */
export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const headers: Record<string, string> = { ...BASE_CORS_HEADERS };
  const origin = request.headers.get('Origin');
  if (!origin) return headers;

  const requestOrigin = new URL(request.url).origin;
  const allowed = [requestOrigin, ...extraAllowedOrigins(env)];

  if (allowed.includes(origin) || allowed.includes('*')) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function mergeHeaders(
  base: HeadersInit | undefined,
  extra: Record<string, string>,
  request?: Request,
  env?: Env
): Headers {
  const headers = new Headers(base);
  for (const [key, value] of Object.entries(extra)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (request && env) {
    for (const [key, value] of Object.entries(corsHeaders(request, env))) {
      headers.set(key, value);
    }
  }
  return headers;
}

/** JSON response with CORS + no-store caching (API responses must never be cached). */
export function json(
  data: unknown,
  init: ResponseInit & { request?: Request; env?: Env } = {}
): Response {
  const { request, env, ...responseInit } = init;
  return new Response(JSON.stringify(data), {
    ...responseInit,
    headers: mergeHeaders(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      (responseInit.headers as Record<string, string>) || {},
      request,
      env
    ),
  });
}

export function ok(data: Record<string, unknown>, request: Request, env: Env): Response {
  return json({ success: true, ...data }, { request, env });
}

export function fail(
  status: number,
  error: string,
  request: Request,
  env: Env,
  extra: Record<string, unknown> = {}
): Response {
  return json({ success: false, error, ...extra }, { status, request, env });
}

export function notFound(request: Request, env: Env, message = 'Not found'): Response {
  return fail(404, message, request, env);
}

/** Handles preflight + returns null when the request is not an OPTIONS call. */
export function handlePreflight(request: Request, env: Env): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

/** Reads a JSON body defensively (Workers throw on malformed JSON). */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
