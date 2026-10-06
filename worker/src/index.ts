/**
 * Recap Studio AI — Cloudflare Workers entry point.
 *
 * This is the Workers replacement for `server.ts` (Express + multer + ffprobe +
 * filesystem uploads). It exposes exactly the same `/api/*` contract so the
 * existing React frontend keeps working unchanged:
 *
 *   GET  /api/samples
 *   GET  /api/api-key-status
 *   POST /api/set-api-key
 *   POST /api/upload
 *   POST /api/upload-url
 *   GET  /api/video/:filename          (HTTP Range / 206 supported)
 *   POST /api/analyze                  (returns a jobId on Workers)
 *   GET  /api/analyze/job/:jobId       (poll + advance the job)
 *   POST /api/refine-script
 *
 * Everything that is not `/api/*` is served from the Worker's static assets
 * (the Vite build in ./dist), with SPA fallback from `not_found_handling`.
 */

import type { Env } from './types';
import { ApiError } from './lib/errors';
import { handlePreflight, json, notFound } from './lib/http';
import { handleSamples } from './routes/samples';
import { handleApiKeyStatus, handleSetApiKey } from './routes/apiKey';
import { handleUpload } from './routes/upload';
import { handleUploadUrl } from './routes/uploadUrl';
import { handleVideo } from './routes/video';
import { handleAnalyze, handleAnalyzeJob } from './routes/analyze';
import { handleRefineScript } from './routes/refineScript';
import { deleteJob, sanitizeJobId } from './lib/storage';
import { currentServerKey } from './routes/apiKey';
import { configureGeminiBaseUrl } from './lib/gemini';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      if (error instanceof ApiError) {
        return json(
          { success: false, error: error.message, ...error.extra },
          { status: error.status, request, env }
        );
      }
      const message = error instanceof Error ? error.message : 'Internal error';
      console.error('[recaps-pro-worker] Unhandled error:', error);
      return json({ success: false, error: message }, { status: 500, request, env });
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Optional: route Gemini traffic through a proxy/gateway (or the local mock
  // used by worker/test/mock-gemini.mjs). Defaults to Google's public endpoint.
  configureGeminiBaseUrl(env.GEMINI_API_BASE);

  const preflight = handlePreflight(request, env);
  if (preflight) return preflight;

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  // ---------------------------------------------------------------- API ----
  if (pathname.startsWith('/api/')) {
    return routeApi(request, env, ctx, pathname, method);
  }

  // -------------------------------------------------------------- assets ---
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return json(
    {
      success: true,
      name: 'Recap Studio AI (Cloudflare Worker)',
      message:
        'API is running, but no static assets are bound. Build the frontend (npm run build) and set [assets] directory = "../dist" in wrangler.toml to serve the UI from this Worker as well.',
      endpoints: [
        'GET /api/samples',
        'GET /api/api-key-status',
        'POST /api/set-api-key',
        'POST /api/upload',
        'POST /api/upload-url',
        'GET /api/video/:filename',
        'POST /api/analyze',
        'GET /api/analyze/job/:jobId',
        'POST /api/refine-script',
      ],
    },
    { request, env }
  );
}

async function routeApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
  method: string
): Promise<Response> {
  // GET /api/samples
  if (pathname === '/api/samples' && (method === 'GET' || method === 'HEAD')) {
    return handleSamples(request, env);
  }

  // GET /api/api-key-status
  if (pathname === '/api/api-key-status' && (method === 'GET' || method === 'HEAD')) {
    return handleApiKeyStatus(request, env);
  }

  // POST /api/set-api-key
  if (pathname === '/api/set-api-key' && method === 'POST') {
    return handleSetApiKey(request, env);
  }

  // POST /api/upload
  if (pathname === '/api/upload' && method === 'POST') {
    return handleUpload(request, env);
  }

  // POST /api/upload-url
  if (pathname === '/api/upload-url' && method === 'POST') {
    return handleUploadUrl(request, env);
  }

  // GET|HEAD /api/video/:filename
  const videoMatch = /^\/api\/video\/(.+)$/.exec(pathname);
  if (videoMatch && (method === 'GET' || method === 'HEAD')) {
    return handleVideo(request, env, videoMatch[1]);
  }

  // POST /api/analyze
  if (pathname === '/api/analyze' && method === 'POST') {
    return handleAnalyze(request, env, ctx);
  }

  // GET|POST /api/analyze/job/:jobId
  const jobMatch = /^\/api\/analyze\/job\/([^/]+)$/.exec(pathname);
  if (jobMatch && (method === 'GET' || method === 'POST')) {
    return handleAnalyzeJob(request, env, ctx, sanitizeJobId(jobMatch[1]));
  }

  // DELETE /api/analyze/job/:jobId — cancel + clean up the job row
  if (jobMatch && method === 'DELETE') {
    await deleteJob(env, jobMatch[1]);
    return json({ success: true, deleted: true }, { request, env });
  }

  // POST /api/refine-script
  if (pathname === '/api/refine-script' && method === 'POST') {
    return handleRefineScript(request, env);
  }

  // GET /api/health — quick deployment diagnostics (never returns the key itself)
  if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
    const { key, source } = await currentServerKey(env);
    return json(
      {
        success: true,
        runtime: 'cloudflare-worker',
        storage: env.VIDEO_BUCKET ? 'r2' : 'unbound',
        apiKey: { configured: Boolean(key), source },
        assetsBound: Boolean(env.ASSETS),
        expectAsyncAnalyze: true,
      },
      { request, env }
    );
  }

  return notFound(request, env, `Unknown API route: ${method} ${pathname}`);
}
