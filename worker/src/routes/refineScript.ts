/**
 * POST /api/refine-script — text-only Gemini refinement.
 * Ported from server.ts; this route was already stateless, so it barely changes.
 */

import type { Env } from '../types';
import { fail, ok, readJson } from '../lib/http';
import { resolveApiKey } from '../lib/keys';
import { generateContent } from '../lib/gemini';

interface RefineBody {
  currentScript?: string;
  action?: string;
  instruction?: string;
  language?: string;
  tone?: string;
  movieName?: string;
  model?: string;
  apiKey?: string;
}

const REFINE_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];

export async function handleRefineScript(request: Request, env: Env): Promise<Response> {
  const body = await readJson<RefineBody>(request);
  const {
    currentScript,
    action,
    instruction,
    language = 'Khmer',
    tone = 'Suspenseful',
    movieName = '',
    model = '3.8',
  } = body;

  if (!currentScript) {
    return fail(400, 'currentScript is required', request, env);
  }

  const { apiKey } = await resolveApiKey(request, env, body.apiKey);

  // --- Offline behaviour (identical to the Express fallback) --------------
  if (!apiKey) {
    let refined = currentScript;
    if (action === 'shorter') {
      const lines = currentScript.split('\n').filter((line) => line.trim().length > 0);
      refined = lines.slice(0, Math.max(3, Math.floor(lines.length * 0.75))).join('\n\n');
    } else if (action === 'improve_hook') {
      if (language === 'Khmer') {
        refined = currentScript.replace(
          /\[HOOK\][\s\S]*?(?=\[SETUP\]|$)/,
          `[HOOK]\nតើអ្នកធ្លាប់គិតទេថា រឿងដែលគួរឱ្យភ័យខ្លាចបំផុត គឺនៅពេលដែលមិត្តភក្តិក្លាយជាសត្រូវ? សូមត្រៀមខ្លួនសម្រាប់អាថ៌កំបាំងដែលមិនធ្លាប់មានពីមុនមក!\n\n`
        );
      } else {
        refined = currentScript.replace(
          /\[HOOK\][\s\S]*?(?=\[SETUP\]|$)/,
          `[HOOK]\nWhat if the greatest secret you've been searching for is the very thing that destroys you? Strap in for an unforgettable revelation!\n\n`
        );
      }
    } else if (action === 'longer') {
      refined = `${currentScript}\n\n[BONUS DETAIL]\nមិនត្រឹមតែប៉ុណ្ណោះទេ ការប្រយុទ្ធគ្នានេះបានបន្សល់ទុកនូវផលវិបាកដែលគ្មាននរណាម្នាក់អាចទស្សន៍ទាយទុកមុនបានឡើយ...`;
    }
    return ok({ refinedScript: refined }, request, env);
  }

  // --- Gemini refinement --------------------------------------------------
  let userInstruction = '';
  if (action === 'shorter') {
    userInstruction =
      'Make the recap script more concise and fast-paced, cutting out minor filler while keeping all major plot twists.';
  } else if (action === 'longer') {
    userInstruction = 'Expand the recap script with richer narrative detail, emotional nuance, and suspense.';
  } else if (action === 'improve_hook') {
    userInstruction = 'Make the opening HOOK extremely punchy, shocking, and irresistible to YouTube viewers!';
  } else if (action === 'regenerate') {
    userInstruction = 'Rewrite the recap with fresh angles and dynamic transitions.';
  } else if (instruction) {
    userInstruction = instruction;
  }

  const prompt = `You are a master movie & anime recap narrator.
Original Script:
"""
${currentScript}
"""

Task:
${userInstruction}

Context:
- Movie / Anime: ${movieName || 'Unknown'}
- Language: ${language}
- Tone: ${tone}

Rules:
- Maintain natural, conversational spoken style in ${language}.
- Return ONLY the updated full recap script without meta explanations.`;

  // Preference order: the user's model first, then the shared fallback list.
  const models = model && model.startsWith('gemini-') ? [model, ...REFINE_MODELS] : REFINE_MODELS;
  let refinedText = currentScript;
  let lastError: unknown = null;

  for (const candidate of models) {
    try {
      const result = await generateContent({
        apiKey,
        model: candidate,
        systemInstruction: '',
        userPrompt: prompt,
        temperature: 0.4,
      });
      refinedText = result.text;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError && refinedText === currentScript) {
    // Never break the editor: return the original script and explain why.
    return ok(
      {
        refinedScript: currentScript,
        geminiNotice: `Gemini refinement failed: ${
          lastError instanceof Error ? lastError.message : 'unknown error'
        }`,
      },
      request,
      env
    );
  }

  return ok({ refinedScript: refinedText }, request, env);
}
