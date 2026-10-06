#!/usr/bin/env node
/**
 * Copies the curated demo videos from the repository's `uploads/` folder into the
 * R2 bucket, so the three sample buttons in the UI work on the deployed Worker.
 *
 *   cd worker
 *   npm run samples:upload
 *
 * Requires: wrangler installed + logged in (`npx wrangler whoami`).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(here, '..');
const repoRoot = resolve(workerDir, '..');
const uploadsDir = join(repoRoot, 'uploads');

const SAMPLES = ['sample-sintel.mp4', 'sample-tears.mp4', 'sample-bunny.mp4'];

/** Reads the bucket name out of wrangler.toml so there is a single source of truth. */
function bucketNameFromConfig() {
  const configPath = join(workerDir, 'wrangler.toml');
  const config = readFileSync(configPath, 'utf8');
  const match = /bucket_name\s*=\s*"([^"]+)"/.exec(config);
  if (!match) throw new Error('Could not find [[r2_buckets]] bucket_name in wrangler.toml');
  return match[1];
}

const bucket = process.env.R2_BUCKET || bucketNameFromConfig();

console.log(`\n📦  Uploading demo samples to R2 bucket "${bucket}"\n`);

let uploaded = 0;
const missing = [];

for (const filename of SAMPLES) {
  const filePath = join(uploadsDir, filename);
  if (!existsSync(filePath)) {
    missing.push(filename);
    console.warn(`⚠️   skipped ${filename} (not found in uploads/)`);
    continue;
  }

  const target = `${bucket}/videos/${filename}`;
  console.log(`⬆️   ${filename}  →  ${target}`);

  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      target,
      `--file=${filePath}`,
      '--content-type=video/mp4',
      '--cache-control=public, max-age=31536000, immutable',
    ],
    { cwd: workerDir, stdio: 'inherit', shell: process.platform === 'win32' }
  );

  if (result.status === 0) {
    uploaded += 1;
  } else {
    console.error(`❌  Failed to upload ${filename}.`);
    process.exitCode = 1;
  }
}

console.log(
  `\n✅  Done. ${uploaded}/${SAMPLES.length} sample video(s) uploaded to "${bucket}".` +
    (missing.length ? `\n    Missing locally: ${missing.join(', ')}` : '') +
    '\n'
);
