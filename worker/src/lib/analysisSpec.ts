/**
 * Prompt + JSON-schema construction for the recap analysis.
 * Ported from server.ts so the generated scripts stay byte-for-byte compatible.
 */

import type { AnalyzeParams } from '../types';
import { ANIME_RECAP_SYSTEM_PROMPT } from './prompts';
import { formatTime, parseTimeToSeconds } from './time';

function targetDurationLabel(params: AnalyzeParams): string {
  return params.targetDuration === 'Custom'
    ? `${params.customDurationMinutes ?? 5} minutes`
    : params.targetDuration || '5 minutes';
}

export function buildSystemInstruction(params: AnalyzeParams, realDuration: number): string {
  const {
    movieName = '',
    episodeNumber = '',
    language = 'Khmer',
    recapStyle = 'Balanced',
    narrationTone = 'Suspenseful',
  } = params;

  return `${ANIME_RECAP_SYSTEM_PROMPT}

==================================================
17. DYNAMIC RECAP SETTINGS & LANGUAGE REQUIREMENTS:
==================================================
- Title: "${movieName || 'Auto-detect from footage'}"
- Episode Number: "${episodeNumber || 'Auto-detect'}"
- Requested Language: "${language}"
  * When Language is "Khmer": Write authentic natural conversational spoken Khmer (ភាសាខ្មែរធម្មជាតិ ដូចជាអ្នកនិទានរឿង YouTube អាជីពនិយាយប្រាប់មិត្តភក្តិ). Never use robotic or literal translations. Keep names consistent.
  * When Language is "English": Write high-retention, suspenseful YouTube recap narrator English.
  * When other language: Write native natural conversational narration.
- Recap Pacing & Style: "${recapStyle}"
- Narration Tone: "${narrationTone}"
- Target Narration Duration: "${targetDurationLabel(params)}"

==================================================
18. DUAL TIMESTAMPS SPECIFICATION:
==================================================
For each cut item in cutGuide:
- recapStart & recapEnd: strictly sequential narration timeline starting at 00:00:00.
- originalStart & originalEnd: exact timestamps in the uploaded video where the visual match occurs.
- visual: detailed visual footage description.
- narration: spoken script corresponding to this cut.
- reason: why this cut was chosen.
- category: one of Action, Character, Dialogue, Important Event, Flashback, Power, Transformation, Plot Twist, Climax, Ending.
- isApproximate: boolean (true if visual timing is an approximation).
- characters: array of character names visible or active in this cut.

==================================================
19. TIMELINE REFERENCE:
==================================================
The uploaded video has a real total duration of ${formatTime(Math.max(1, Math.round(realDuration)))} (${Math.max(1, Math.round(realDuration))} seconds).
Never emit an originalStart / originalEnd timestamp beyond this duration.`;
}

export function buildUserPrompt(params: AnalyzeParams): string {
  return `Analyze this video thoroughly from beginning to end and generate the complete professional recap package.
Movie / Anime Title: "${params.movieName || 'Auto-detect'}"
Episode Number: "${params.episodeNumber || 'Auto-detect'}"
Narration Language: "${params.language || 'Khmer'}"
Recap Style: "${params.recapStyle || 'Balanced'}"
Narration Tone: "${params.narrationTone || 'Suspenseful'}"
Target Narration Duration: "${targetDurationLabel(params)}"

Provide the response strictly in JSON conforming to the schema.`;
}

/** JSON schema handed to `responseSchema` — same fields as server.ts. */
export function recapResponseSchema(): Record<string, unknown> {
  return {
    type: 'OBJECT',
    properties: {
      detectedTitle: { type: 'STRING' },
      detectedType: { type: 'STRING' },
      detectedEpisode: { type: 'STRING' },
      genre: { type: 'STRING' },
      detectedCharacters: { type: 'ARRAY', items: { type: 'STRING' } },
      keyPowersOrThemes: { type: 'ARRAY', items: { type: 'STRING' } },
      synopsis: { type: 'STRING' },
      estimatedNarrationDuration: { type: 'STRING' },
      wordCount: { type: 'INTEGER' },
      recapScript: {
        type: 'OBJECT',
        properties: {
          fullText: { type: 'STRING' },
          sections: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                heading: { type: 'STRING' },
                narration: { type: 'STRING' },
              },
              required: ['heading', 'narration'],
            },
          },
        },
        required: ['fullText', 'sections'],
      },
      cutGuide: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            cutNumber: { type: 'INTEGER' },
            recapStart: { type: 'STRING' },
            recapEnd: { type: 'STRING' },
            originalStart: { type: 'STRING' },
            originalEnd: { type: 'STRING' },
            visual: { type: 'STRING' },
            narration: { type: 'STRING' },
            reason: { type: 'STRING' },
            category: { type: 'STRING' },
            isApproximate: { type: 'BOOLEAN' },
            characters: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: [
            'cutNumber',
            'recapStart',
            'recapEnd',
            'originalStart',
            'originalEnd',
            'visual',
            'narration',
            'reason',
            'category',
            'isApproximate',
          ],
        },
      },
    },
    required: [
      'detectedTitle',
      'detectedType',
      'genre',
      'detectedCharacters',
      'synopsis',
      'recapScript',
      'cutGuide',
    ],
  };
}

interface RawCut {
  cutNumber?: number;
  recapStart?: string;
  recapEnd?: string;
  originalStart?: string;
  originalEnd?: string;
  visual?: string;
  narration?: string;
  reason?: string;
  category?: string;
  isApproximate?: boolean;
  characters?: string[];
}

/**
 * Adds the derived fields the frontend expects (`id`, `*Sec`) — the same
 * post-processing that happened inside `/api/analyze` in server.ts.
 */
export function normalizeAnalysis<T extends { cutGuide?: RawCut[] }>(parsed: T): T {
  if (Array.isArray(parsed.cutGuide)) {
    parsed.cutGuide = parsed.cutGuide.map((cut, index) => ({
      ...cut,
      id: `cut-${index + 1}-${Date.now()}`,
      cutNumber: cut.cutNumber || index + 1,
      recapStartSec: parseTimeToSeconds(cut.recapStart || '00:00:00'),
      recapEndSec: parseTimeToSeconds(cut.recapEnd || '00:00:00'),
      originalStartSec: parseTimeToSeconds(cut.originalStart || '00:00:00'),
      originalEndSec: parseTimeToSeconds(cut.originalEnd || '00:00:00'),
      characters: cut.characters || [],
    })) as RawCut[];
  }
  return parsed;
}
