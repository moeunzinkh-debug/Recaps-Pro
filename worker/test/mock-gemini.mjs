#!/usr/bin/env node
/**
 * A tiny stand-in for the Gemini API, used to smoke-test the Worker's analysis
 * job engine (resumable upload → processing poll → generateContent → done)
 * without a real API key or Google quota.
 *
 *   node test/mock-gemini.mjs            # listens on 127.0.0.1:8899
 *   cd worker && npx wrangler dev --var GEMINI_API_BASE:http://127.0.0.1:8899
 *
 * The Worker prefers env.GEMINI_API_BASE when it is set (see src/lib/gemini.ts),
 * so nothing else needs to change.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 8899);
const PROCESSING_POLLS = Number(process.env.MOCK_PROCESSING_POLLS || 2);

const sessions = new Map();
const files = new Map();

const RECAP_PAYLOAD = {
  detectedTitle: 'Mock Video - The Smoke Test',
  detectedType: 'Anime',
  detectedEpisode: 'Episode 1',
  genre: 'Action / Fantasy',
  detectedCharacters: ['Mock Hero', 'Mock Rival'],
  keyPowersOrThemes: ['Resumable Upload', 'Streamed Storage'],
  synopsis: 'A synthetic recap produced by the local mock Gemini server for testing.',
  estimatedNarrationDuration: '00:05:00',
  wordCount: 42,
  recapScript: {
    fullText: '[HOOK]\nA single request could never have finished this job...\n\n[SETUP]\nSo the work was split into steps.',
    sections: [
      { heading: 'HOOK', narration: 'A single request could never have finished this job...' },
      { heading: 'SETUP', narration: 'So the work was split into steps.' },
    ],
  },
  cutGuide: [
    {
      cutNumber: 1,
      recapStart: '00:00:00',
      recapEnd: '00:00:07',
      originalStart: '00:00:00',
      originalEnd: '00:00:06',
      visual: 'Title card fades in over a dark forest.',
      narration: 'This is where it all began.',
      reason: 'Strong opening hook.',
      category: 'Important Event',
      isApproximate: false,
      characters: ['Mock Hero'],
    },
    {
      cutNumber: 2,
      recapStart: '00:00:07',
      recapEnd: '00:00:15',
      originalStart: '00:00:06',
      originalEnd: '00:00:12',
      visual: 'The rival steps out of the shadows.',
      narration: 'But someone was already waiting.',
      reason: 'Introduces the antagonist.',
      category: 'Character',
      isApproximate: true,
      characters: ['Mock Hero', 'Mock Rival'],
    },
  ],
};

function send(res, status, payload, headers = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const command = String(req.headers['x-goog-upload-command'] || '');

    // ---- 1. start a resumable upload session --------------------------
    if (req.method === 'POST' && url.pathname === '/upload/v1beta/files') {
      const id = randomUUID();
      sessions.set(id, {
        received: 0,
        expected: Number(req.headers['x-goog-upload-header-content-length'] || 0),
        mimeType: String(req.headers['x-goog-upload-header-content-type'] || 'video/mp4'),
        displayName: (() => {
          try {
            return JSON.parse(body.toString() || '{}')?.file?.display_name || '';
          } catch {
            return '';
          }
        })(),
      });
      console.log(`[mock-gemini] start session ${id} (expected ${sessions.get(id).expected} bytes)`);
      return send(res, 200, {}, { 'X-Goog-Upload-URL': `http://127.0.0.1:${PORT}/session/${id}` });
    }

    // ---- 2. receive chunks -------------------------------------------
    if (req.method === 'POST' && url.pathname.startsWith('/session/')) {
      const id = url.pathname.split('/')[2];
      const session = sessions.get(id);
      if (!session) return send(res, 404, { error: { message: 'unknown session' } });

      const offset = Number(req.headers['x-goog-upload-offset'] || 0);
      if (offset !== session.received) {
        console.error(`[mock-gemini] ❌ offset mismatch: got ${offset}, expected ${session.received}`);
        return send(res, 400, {
          error: { message: `offset mismatch: got ${offset}, expected ${session.received}` },
        });
      }

      session.received += body.length;
      const final = command.includes('finalize');
      console.log(
        `[mock-gemini] chunk ${body.length} bytes @${offset}${final ? ' (final)' : ''} — total ${session.received}/${session.expected}`
      );

      if (!final) return send(res, 200, {});

      const name = `files/mock-${id.slice(0, 8)}`;
      files.set(name, { polls: 0, size: session.received, mimeType: session.mimeType });
      return send(res, 200, {
        file: {
          name,
          uri: `http://127.0.0.1:${PORT}/v1beta/${name}`,
          mimeType: session.mimeType,
          sizeBytes: String(session.received),
          state: 'PROCESSING',
        },
      });
    }

    // ---- 3. processing state -----------------------------------------
    const fileMatch = /^\/v1beta\/(files\/[^/]+)$/.exec(url.pathname);
    if (fileMatch) {
      if (req.method === 'DELETE') {
        files.delete(fileMatch[1]);
        return send(res, 200, {});
      }
      const file = files.get(fileMatch[1]) || { polls: PROCESSING_POLLS, size: 0, mimeType: 'video/mp4' };
      file.polls += 1;
      const state = file.polls > PROCESSING_POLLS ? 'ACTIVE' : 'PROCESSING';
      console.log(`[mock-gemini] get ${fileMatch[1]} → ${state}`);
      return send(res, 200, {
        name: fileMatch[1],
        uri: `http://127.0.0.1:${PORT}/v1beta/${fileMatch[1]}`,
        mimeType: file.mimeType,
        sizeBytes: String(file.size),
        state,
      });
    }

    // ---- 4. generateContent ------------------------------------------
    const generateMatch = /^\/v1beta\/models\/([^:]+):generateContent$/.exec(url.pathname);
    if (generateMatch && req.method === 'POST') {
      const parsed = JSON.parse(body.toString() || '{}');
      const parts = parsed?.contents?.[0]?.parts || [];
      const filePart = parts.find((part) => part.file_data);
      const schema = parsed?.generationConfig?.responseSchema;
      console.log(
        `[mock-gemini] generateContent model=${generateMatch[1]} file=${filePart?.file_data?.file_uri || 'MISSING'} schema=${schema ? 'yes' : 'no'} system=${parsed.systemInstruction ? 'yes' : 'no'}`
      );
      return send(res, 200, {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify(RECAP_PAYLOAD) }] },
          },
        ],
      });
    }

    console.warn(`[mock-gemini] unhandled ${req.method} ${url.pathname}`);
    return send(res, 404, { error: { message: 'not found' } });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-gemini] listening on http://127.0.0.1:${PORT} (PROCESSING polls: ${PROCESSING_POLLS})`);
});
