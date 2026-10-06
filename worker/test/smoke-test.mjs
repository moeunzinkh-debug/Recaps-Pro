#!/usr/bin/env node
/**
 * Smoke test for the Workers backend — verifies the endpoints that replaced
 * Node-only behaviour (multer uploads, ffprobe, fs streaming, the long
 * /api/analyze request) without needing a real Gemini key.
 *
 *   Terminal 1:  cd worker && npm run dev
 *   Terminal 2:  npm run smoke
 *
 * Options:
 *   --url=<base>     default http://127.0.0.1:8787
 *   --video=<path>   default ../uploads/sample-sintel.mp4
 *   --with-mock      also test the full Gemini job flow. Requires the dev server
 *                    to run with `--var GEMINI_API_BASE:http://127.0.0.1:8899`
 *                    and `node test/mock-gemini.mjs` running.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  })
);

const BASE = (args.get('url') || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const VIDEO_PATH = resolve(here, args.get('video') || '../..//uploads/sample-sintel.mp4');
const WITH_MOCK = args.has('with-mock');

const results = [];
let failures = 0;

const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const dim = (text) => `\x1b[2m${text}\x1b[0m`;

function check(name, condition, detail = '') {
  const passed = Boolean(condition);
  if (!passed) failures += 1;
  results.push({ name, passed, detail });
  console.log(`${passed ? green('  ✓') : red('  ✗')} ${name}${detail ? dim(` — ${detail}`) : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n🔎 Smoke testing ${BASE}\n`);

  if (!existsSync(VIDEO_PATH)) {
    console.error(red(`Test video not found: ${VIDEO_PATH}`));
    process.exit(1);
  }
  const sourceSize = statSync(VIDEO_PATH).size;
  const sourceBuffer = readFileSync(VIDEO_PATH);
  console.log(dim(`   using ${VIDEO_PATH} (${sourceSize} bytes)\n`));

  // ---------------------------------------------------------------- health --
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check('GET /api/health', health.success === true, `storage=${health.storage}`);
  check('R2 bucket bound', health.storage === 'r2', 'run `npx wrangler r2 bucket create recaps-pro-videos` if unbound');

  const samples = await (await fetch(`${BASE}/api/samples`)).json();
  check('GET /api/samples', Array.isArray(samples.samples) && samples.samples.length === 3, `${samples.samples?.length} samples`);

  const page = await fetch(`${BASE}/`);
  const html = await page.text();
  check('GET / serves the SPA', page.ok && html.includes('<div id="root"'), `HTTP ${page.status}`);

  // --------------------------------------------------------------- upload ---
  const form = new FormData();
  form.append('durationSec', '52');
  form.append('width', '1280');
  form.append('height', '720');
  form.append('video', new Blob([sourceBuffer], { type: 'video/mp4' }), 'smoke-test.mp4');

  const uploadRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  const upload = await uploadRes.json();
  check(
    'POST /api/upload (multipart, streamed to R2)',
    upload.success === true,
    upload.error || `storedName=${upload.file?.storedName}`
  );
  check(
    'uploaded bytes match the source file',
    upload.file?.size === sourceSize,
    `${upload.file?.size} vs ${sourceSize}`
  );
  const storedName = upload.file?.storedName;
  const videoUrl = `${BASE}/api/video/${storedName}`;

  // --------------------------------------------------------------- ranges ---
  const full = await fetch(videoUrl);
  const fullBytes = new Uint8Array(await full.arrayBuffer());
  check('GET /api/video/:name (full)', full.status === 200 && fullBytes.byteLength === sourceSize, `HTTP ${full.status}, ${fullBytes.byteLength} bytes`);
  check('Accept-Ranges advertised', full.headers.get('accept-ranges') === 'bytes');

  const partial = await fetch(videoUrl, { headers: { Range: 'bytes=0-1023' } });
  const partialBytes = new Uint8Array(await partial.arrayBuffer());
  check(
    'Range request → 206 + Content-Range',
    partial.status === 206 && partial.headers.get('content-range') === `bytes 0-1023/${sourceSize}` && partialBytes.byteLength === 1024,
    `HTTP ${partial.status}, ${partial.headers.get('content-range')}`
  );

  const openEnded = await fetch(videoUrl, { headers: { Range: 'bytes=1000-' } });
  check('open-ended range', openEnded.status === 206 && Number(openEnded.headers.get('content-length')) === sourceSize - 1000);

  const suffix = await fetch(videoUrl, { headers: { Range: 'bytes=-500' } });
  check('suffix range', suffix.status === 206 && Number(suffix.headers.get('content-length')) === 500);

  const bad = await fetch(videoUrl, { headers: { Range: `bytes=${sourceSize + 10}-` } });
  check('unsatisfiable range → 416', bad.status === 416);

  const head = await fetch(videoUrl, { method: 'HEAD' });
  check('HEAD /api/video/:name', head.status === 200 && Number(head.headers.get('content-length')) === sourceSize);

  const missing = await fetch(`${BASE}/api/video/definitely-not-here.mp4`);
  check('missing video → 404', missing.status === 404);

  // ------------------------------------------------ analyze (offline path) --
  const offline = await (
    await fetch(`${BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storedName, movieName: 'Smoke Test', language: 'Khmer' }),
    })
  ).json();
  check('POST /api/analyze without a key → offline engine', offline.success === true && offline.generatedWith === 'real-video-engine');
  check(
    'offline engine returns a full recap package',
    Array.isArray(offline.data?.cutGuide) && offline.data.cutGuide.length === 6 && typeof offline.data.recapScript?.fullText === 'string',
    `${offline.data?.cutGuide?.length} cuts`
  );
  check(
    'cut guide carries derived *Sec fields',
    typeof offline.data?.cutGuide?.[0]?.recapStartSec === 'number' && typeof offline.data?.cutGuide?.[0]?.originalEndSec === 'number'
  );

  const missingVideo = await fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storedName: 'nope.mp4' }),
  });
  check('analyze of an unknown video → 404', missingVideo.status === 404);

  // ------------------------------------------- analyze (full Gemini job) ----
  if (WITH_MOCK) {
    console.log(dim('\n   job flow (mock Gemini)…'));
    const started = await (
      await fetch(`${BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-gemini-api-key': 'mock-key' },
        body: JSON.stringify({ storedName, movieName: 'Smoke Test', language: 'Khmer' }),
      })
    ).json();

    check('POST /api/analyze with a key → jobId', Boolean(started.jobId), `state=${started.state}`);

    let status = started;
    let data = null;
    for (let attempt = 0; attempt < 30 && started.jobId; attempt += 1) {
      await sleep(1500);
      status = await (
        await fetch(`${BASE}/api/analyze/job/${started.jobId}`, { headers: { 'x-gemini-api-key': 'mock-key' } })
      ).json();
      if (status.state === 'done') {
        data = status.data;
        break;
      }
      if (status.state === 'failed') break;
    }

    check('job reached state=done', status.state === 'done', status.error || `last=${status.state}`);
    check(
      'job result is normalised (ids + *Sec)',
      Boolean(data?.cutGuide?.length) && typeof data.cutGuide[0].recapStartSec === 'number' && data.cutGuide[0].id?.startsWith('cut-')
    );
  }

  // -------------------------------------------------------------- summary ---
  const passed = results.length - failures;
  console.log(
    `\n${failures === 0 ? green('✅ All checks passed') : red(`❌ ${failures} check(s) failed`)} — ${passed}/${results.length}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(red(`\n💥 Smoke test crashed: ${error.message}\n`));
  console.error('Is the dev server running? `cd worker && npm run dev`\n');
  process.exit(1);
});
