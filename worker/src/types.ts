/**
 * Shared types for the Cloudflare Workers runtime.
 *
 * The shape of the API responses / project data is identical to the Express
 * version in the repository root (see src/types.ts) so the React frontend works
 * against either backend without changes.
 */

export interface Env {
  /** R2 bucket holding uploaded videos, jobs and the optional stored API key. */
  VIDEO_BUCKET?: R2Bucket;
  /** Static assets of the Vite build (served by the Worker for non-API routes). */
  ASSETS?: Fetcher;
  /**
   * Optional server-side Gemini API key. Set it as a secret:
   *   npx wrangler secret put GEMINI_API_KEY
   * Users can still connect their own key from the Settings screen.
   */
  GEMINI_API_KEY?: string;
  /** Public R2 bucket URL (optional) — useful for very large files / direct CDN reads. */
  R2_PUBLIC_URL?: string;
  /** Comma-separated list of extra allowed origins for CORS (optional). */
  ALLOWED_ORIGINS?: string;
  /**
   * Optional override for the Gemini API base URL — used by proxies/gateways and
   * by the offline smoke test (worker/test/mock-gemini.mjs).
   */
  GEMINI_API_BASE?: string;
}

export interface SampleDemoVideo {
  id: string;
  title: string;
  type: string;
  genre: string;
  duration: string;
  durationSec: number;
  url: string;
  storedName: string;
  description: string;
}

export interface VideoInfo {
  fileName: string;
  storedName: string;
  filePath?: string;
  mimeType: string;
  size: number;
  videoUrl: string;
  duration?: number;
  width?: number;
  height?: number;
  detectedTitle?: string;
  detectedType?: string;
  detectedEpisode?: string;
  isSample?: boolean;
}

export interface AnalyzeParams {
  storedName: string;
  movieName?: string;
  episodeNumber?: string;
  language?: string;
  recapStyle?: string;
  narrationTone?: string;
  targetDuration?: string;
  customDurationMinutes?: number;
  model?: string;
}

/**
 * A long-running Gemini analysis.
 *
 * Cloudflare Workers cannot hold a request open for minutes while a 2 GB video
 * is uploaded to the Gemini Files API and analysed, so the job is persisted in
 * R2 and advanced one step at a time on every poll from the browser.
 */
export interface AnalyzeJob {
  id: string;
  createdAt: number;
  updatedAt: number;
  state: 'pending' | 'uploading' | 'processing' | 'generating' | 'done' | 'failed';
  progress: number;
  message: string;
  params: AnalyzeParams;
  storedName: string;
  duration: number;
  /**
   * Where the API key for this job came from. When it is `request`, the browser
   * must keep sending `x-gemini-api-key` while polling (the key is never stored).
   */
  keySource?: 'request' | 'env' | 'stored';
  /** Gemini resumable-upload session URL (returned by the `start` command). */
  uploadUrl?: string;
  /** Total size of the stored video in bytes. */
  uploadSize?: number;
  /** How many bytes of the video have already been handed to Google. */
  uploadOffset?: number;
  uploadMimeType?: string;
  geminiFileName?: string;
  geminiFileUri?: string;
  /** Timestamp (ms) at which the generation step was kicked off in the background. */
  generationStartedAt?: number;
  generationAttempts?: number;
  /** Finish reason reported by Gemini (diagnostics only). */
  finishReason?: string;
  error?: string;
  /** Final `VideoAnalysisData` payload once `state === 'done'`. */
  data?: unknown;
  /** Human-readable note about the generation (e.g. a Gemini API fallback). */
  geminiNotice?: string;
  /** Simple mutual-exclusion guard so two polls cannot advance the job at once. */
  lockUntil?: number;
}
