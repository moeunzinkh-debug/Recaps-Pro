/** GET /api/samples — list of curated demo videos (same payload as the Express server). */

import type { Env, SampleDemoVideo } from '../types';
import { DEMO_SAMPLES } from '../lib/samples';
import { json } from '../lib/http';

export function handleSamples(request: Request, env: Env): Response {
  return json(
    { samples: DEMO_SAMPLES as SampleDemoVideo[] },
    { request, env, headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
