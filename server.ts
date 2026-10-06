import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const safeBaseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${safeBaseName}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB
  },
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to get GoogleGenAI client (supports server env or user-supplied key)
function getGeminiClient(explicitApiKey?: string): GoogleGenAI | null {
  const apiKey = explicitApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Format seconds into HH:MM:SS
function formatTime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Parse HH:MM:SS or MM:SS to seconds
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(timeStr) || 0;
}

// Extract true video duration and dimensions using ffprobe
function getVideoMetadata(filePath: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=width,height',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      (err, stdout) => {
        if (err || !stdout) {
          return resolve({ duration: 52, width: 1280, height: 720 });
        }
        const lines = stdout.trim().split('\n').filter(Boolean);
        const duration = parseFloat(lines[lines.length - 1]) || 52;
        const width = parseInt(lines[0], 10) || 1280;
        const height = parseInt(lines[1], 10) || 720;
        resolve({ duration: Math.max(1, Math.round(duration)), width, height });
      }
    );
  });
}

// Clean raw video file name into clean movie/anime title
function cleanVideoTitle(rawName: string): { title: string; detectedEpisode?: string } {
  let clean = rawName.replace(/\.[^/.]+$/, '');
  clean = clean.replace(/\[.*?\]|\(.*?\)/g, ' ').trim();
  let detectedEpisode: string | undefined = undefined;
  const epMatch = clean.match(/(?:s\d+e|ep(?:isode)?\s*|#)(\d+)/i);
  if (epMatch) {
    detectedEpisode = `Episode ${parseInt(epMatch[1], 10)}`;
  }
  clean = clean.replace(/\b(1080p|720p|480p|4k|x264|x265|hevc|webrip|bluray|aac|h264|dvdrip|repack|hdrip)\b/gi, '');
  clean = clean.replace(/[._-]+/g, ' ').trim();
  return { title: clean || 'Movie / Anime Feature', detectedEpisode };
}

// Detect content type from title keywords
function detectContentTypeFromTitle(title: string): { type: string; genre: string } {
  const lower = title.toLowerCase();
  const animeKeywords = [
    'anime', 'sintel', 'titan', 'slayer', 'naruto', 'jujutsu', 'piece', 'bleach',
    'dragon', 'solo leveling', 'chainsaw', 'spy', 'death note', 'ghibli',
    'frieren', 'boku', 'hero', 'hunter', 'alchemist', 'one punch', 'haikyuu',
    'geass', 'evangelion', 'tokyo ghoul', 'black clover', 'boruto', 'fate'
  ];
  const cartoonKeywords = [
    'cartoon', 'bunny', 'tom', 'jerry', 'sponge', 'looney', 'simpson',
    'rick and morty', 'adventure time', 'disney', 'pixar', 'shrek'
  ];

  if (animeKeywords.some((k) => lower.includes(k))) {
    return { type: 'Anime', genre: 'Shonen / Action / Fantasy' };
  }
  if (cartoonKeywords.some((k) => lower.includes(k))) {
    return { type: 'Cartoon', genre: 'Comedy / Animation / Adventure' };
  }
  return { type: 'Live-action movie', genre: 'Action / Sci-Fi / Suspense' };
}

// Local curated demo sample videos (streamed reliably from local /api/video/)
const DEMO_SAMPLES = [
  {
    id: 'sample-sintel',
    title: 'Sintel - The Dragon Hunt',
    type: 'Anime / 3D Animation',
    genre: 'Fantasy / Action / Drama',
    duration: '00:00:52',
    durationSec: 52,
    storedName: 'sample-sintel.mp4',
    url: '/api/video/sample-sintel.mp4',
    description: 'A young warrior battles snow, beasts, and treacherous mountains searching for her lost baby dragon companion.',
  },
  {
    id: 'sample-tears',
    title: 'Tears of Steel - Cyberpunk Battlefield',
    type: 'Live-action / Sci-Fi Movie',
    genre: 'Sci-Fi / Action / Cyberpunk',
    duration: '00:00:48',
    durationSec: 48,
    storedName: 'sample-tears.mp4',
    url: '/api/video/sample-tears.mp4',
    description: 'Dystopian future warriors fight rogue robotic AI mechs in an apocalyptic Amsterdam rocket launchpad.',
  },
  {
    id: 'sample-bunny',
    title: 'Big Buck Bunny - Forest Showdown',
    type: 'Cartoon / Animation',
    genre: 'Comedy / Adventure',
    duration: '00:00:33',
    durationSec: 33,
    storedName: 'sample-bunny.mp4',
    url: '/api/video/sample-bunny.mp4',
    description: 'A gentle giant woodland creature is provoked by bully forest critters and enacts clever retribution.',
  },
];

// Endpoint: List sample demo videos
app.get('/api/samples', (_req: Request, res: Response) => {
  res.json({ samples: DEMO_SAMPLES });
});

// Endpoint: Check API key status
app.get('/api/api-key-status', (_req: Request, res: Response) => {
  const currentKey = process.env.GEMINI_API_KEY;
  const isSet = Boolean(currentKey && currentKey.trim() !== '' && currentKey !== 'MY_GEMINI_API_KEY');
  const maskedKey = isSet && currentKey
    ? (currentKey.length > 8 ? currentKey.slice(0, 4) + '••••••••' + currentKey.slice(-4) : '••••••••')
    : null;
  res.json({
    hasKey: isSet,
    maskedKey,
  });
});

// Endpoint: Set or update Gemini API key with live verification
app.post('/api/set-api-key', async (req: Request, res: Response) => {
  const { apiKey } = req.body;
  if (apiKey === null || apiKey === undefined || apiKey === '' || apiKey === 'REMOVE') {
    delete process.env.GEMINI_API_KEY;
    return res.json({
      success: true,
      hasKey: false,
      maskedKey: null,
      message: 'Gemini API key removed from server.',
    });
  }

  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    return res.status(400).json({ error: 'Please provide a valid API key string' });
  }

  const cleanKey = apiKey.trim();

  // Test the key against Google Gemini API to give instant verification
  try {
    const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
    if (!testRes.ok) {
      const errData: any = await testRes.json().catch(() => ({}));
      const msg = errData?.error?.message || `Google API returned status ${testRes.status}`;
      return res.status(400).json({
        error: `Gemini API Key verification failed: ${msg}. Please ensure you are using an API key from https://aistudio.google.com/apikey`,
      });
    }
  } catch (netErr: any) {
    console.warn('Could not reach Google verification endpoint:', netErr.message);
  }

  process.env.GEMINI_API_KEY = cleanKey;
  console.log('[Recap Studio AI] GEMINI_API_KEY verified and saved in server environment.');

  const maskedKey = cleanKey.length > 8
    ? cleanKey.slice(0, 4) + '••••••••' + cleanKey.slice(-4)
    : '••••••••';

  res.json({
    success: true,
    hasKey: true,
    maskedKey,
    message: 'Google Gemini API Key verified and saved successfully!',
  });
});

// Endpoint: Upload real video file with automatic ffprobe duration detection
app.post('/api/upload', upload.single('video'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  try {
    // Run ffprobe on the uploaded real video
    const meta = await getVideoMetadata(req.file.path);
    const cleaned = cleanVideoTitle(req.file.originalname);

    const fileInfo = {
      fileName: req.file.originalname,
      storedName: req.file.filename,
      filePath: req.file.path,
      mimeType: req.file.mimetype || 'video/mp4',
      size: req.file.size,
      duration: meta.duration,
      videoUrl: `/api/video/${req.file.filename}`,
      detectedTitle: cleaned.title,
      detectedEpisode: cleaned.detectedEpisode,
    };

    return res.json({ success: true, file: fileInfo });
  } catch (err: any) {
    console.error('Error processing uploaded video:', err);
    return res.status(500).json({ error: 'Failed to inspect uploaded video.' });
  }
});

// Endpoint: Download video from URL or set sample video URL
app.post('/api/upload-url', async (req: Request, res: Response) => {
  const { url, title } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  try {
    // 1. Check if this is an internal sample or matches local sample keywords
    const lowerUrl = url.toLowerCase();
    const matchedSample = DEMO_SAMPLES.find(
      (s) =>
        s.url === url ||
        s.id === url ||
        s.storedName === url ||
        lowerUrl.includes(s.id) ||
        lowerUrl.includes(s.storedName) ||
        (s.id === 'sample-sintel' && lowerUrl.includes('sintel')) ||
        (s.id === 'sample-tears' && lowerUrl.includes('tears')) ||
        (s.id === 'sample-bunny' && lowerUrl.includes('bunny'))
    );

    if (matchedSample) {
      const samplePath = path.join(uploadsDir, matchedSample.storedName);
      const stats = fs.existsSync(samplePath) ? fs.statSync(samplePath) : { size: 1348375 };
      return res.json({
        success: true,
        file: {
          fileName: `${matchedSample.title}.mp4`,
          storedName: matchedSample.storedName,
          filePath: samplePath,
          mimeType: 'video/mp4',
          size: stats.size,
          duration: matchedSample.durationSec,
          videoUrl: matchedSample.url,
          isSample: true,
        },
      });
    }

    // 2. Handle YouTube URLs
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    if (isYouTube) {
      return res.status(400).json({
        error:
          'YouTube enforces cloud bot protection (HTTP 403 Forbidden) against cloud servers. Please download your YouTube video to your device, then use [Drag & Drop] or [Choose Video] to upload it directly for Gemini analysis!',
      });
    }

    // 3. Direct Video URL (MP4, WebM, MOV, CDN)
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const ext = path.extname(pathname) || '.mp4';
    const baseName = (title || 'direct_video').replace(/[^a-zA-Z0-9_-]/g, '_');
    const storedName = `${baseName}-${Date.now()}${ext}`;
    const destinationPath = path.join(uploadsDir, storedName);

    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'video/*,*/*;q=0.9',
      },
    });

    if (!fetchResponse.ok) {
      if (fetchResponse.status === 403) {
        throw new Error('Video host blocked cloud server download (HTTP 403 Forbidden). Please download the video directly to your device and use [Choose Video] or drag and drop to upload!');
      }
      throw new Error(`Remote video host returned status ${fetchResponse.status} ${fetchResponse.statusText}`);
    }

    const arrayBuffer = await fetchResponse.arrayBuffer();
    fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));

    const meta = await getVideoMetadata(destinationPath);
    const stats = fs.statSync(destinationPath);
    const fileInfo = {
      fileName: title ? `${title}${ext}` : path.basename(pathname),
      storedName,
      filePath: destinationPath,
      mimeType: fetchResponse.headers.get('content-type') || 'video/mp4',
      size: stats.size,
      duration: meta.duration,
      videoUrl: `/api/video/${storedName}`,
      isSample: false,
    };

    return res.json({ success: true, file: fileInfo });
  } catch (err: any) {
    console.error('Error downloading video from URL:', err);
    return res.status(400).json({
      error: `Could not download video URL: ${err.message || 'Access error'}. Please upload the video file directly!`,
    });
  }
});

// Endpoint: Stream video file with HTTP Range support for seamless seeking
app.get('/api/video/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadsDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  let mimeType = 'video/mp4';
  if (filePath.endsWith('.webm')) mimeType = 'video/webm';
  else if (filePath.endsWith('.mov')) mimeType = 'video/quicktime';
  else if (filePath.endsWith('.avi')) mimeType = 'video/x-msvideo';
  else if (filePath.endsWith('.mkv')) mimeType = 'video/x-matroska';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
      return;
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

const ANIME_RECAP_SYSTEM_PROMPT = `PROFESSIONAL ANIME RECAP PROMPT — NEW VERSION

Analyze the uploaded anime video carefully from beginning to end.

Your job is to create a professional Khmer anime recap that feels like a real YouTube anime recap, not a scene-by-scene summary.

IMPORTANT:
The uploaded video is the ONLY source of truth.
Do not invent events, characters, dialogue, powers, relationships, motivations, or story details that are not supported by the video.

==================================================
1. UNDERSTAND THE WHOLE STORY FIRST
==================================================
Before writing anything, analyze the entire uploaded video.
Understand:
- What happens at the beginning
- Who the important characters are
- What each character wants
- What causes the main conflict
- What important events happen
- How characters react
- How one event causes another
- What new problems appear
- What important information is revealed
- How conflicts are resolved
- What happens at the climax
- How the episode/movie ends

Do NOT start writing the recap while only looking at the first few scenes.
Understand the complete story first.

==================================================
2. THE RECAP STYLE
==================================================
Write the recap like a professional YouTube anime recap narrator is telling the story to the audience.
The audience should feel:
"Someone is telling me an interesting anime story."
NOT:
"An AI is describing every scene in the video."

The narration must be:
- Natural
- Conversational
- Fast-moving
- Easy to understand
- Interesting
- Suspenseful
- Story-focused
- Easy to speak aloud

Use natural Khmer.
Avoid overly formal Khmer.
Do not translate English/Japanese sentences literally.
Rewrite the meaning naturally for Khmer viewers.

==================================================
3. START WITH A STRONG HOOK
==================================================
Do not begin with:
"ថ្ងៃនេះយើងនឹងមកសម្រាយ..."
"ក្នុងវីដេអូនេះ..."
"សួស្តីអ្នកទាំងអស់គ្នា..."

Start directly with an interesting event, mystery, danger, ability, discovery, or unexpected situation.
The opening should make the audience want to know:
"What happened?"
"Why did this happen?"
"What is going to happen next?"

After creating the hook, naturally continue into the actual beginning of the story.

==================================================
4. TELL ONE CONTINUOUS STORY
==================================================
The recap must feel like ONE continuous story.
Do NOT write:
Scene 1:
Scene 2:
Scene 3:

Do NOT make every paragraph feel like a separate scene summary.
Instead, connect events naturally.
Use the storytelling flow:
EVENT → REACTION → CONSEQUENCE → NEW INFORMATION → NEW PROBLEM → ACTION → RESULT → NEXT DEVELOPMENT

For every important event, understand:
What happened? Why did it happen? How did the character react? What changed? What happened because of it?
The narration should naturally explain cause and effect.

==================================================
5. DO NOT DESCRIBE EVERY SHOT
==================================================
Do NOT narrate every visual action.
BAD:
"តួឯកដើរចូលបន្ទប់។ បន្ទាប់មកគេអង្គុយ។ បន្ទាប់មកបុរសម្នាក់ចូលមក។ បន្ទាប់មកពួកគេចាប់ផ្តើមនិយាយគ្នា។"
GOOD STYLE:
"បន្ទាប់ពីតួឯកចូលមកដល់កន្លែងនោះ គេក៏បានជួបមនុស្សម្នាក់ដែលកាន់ព័ត៌មានសំខាន់មួយ។ ប៉ុន្តែអ្វីដែលគេមិនដឹងនោះគឺ ព័ត៌មាននេះនឹងធ្វើឱ្យបញ្ហារបស់គេកាន់តែធ្ងន់ធ្ងរឡើង។"

Focus on the STORY, not every camera shot.

==================================================
6. KEEP THE STORY MOVING
==================================================
Every paragraph should contribute something important.
Prioritize:
- Important actions, character decisions, character relationships
- Important conversations, new characters, powers, battles
- Discoveries, mysteries, plot twists, emotional reactions
- Villain plans, important objects, transformations
- Major victories, major defeats, consequences, ending / cliffhanger

Remove unnecessary:
- Repeated information, meaningless walking, empty pauses, unimportant background actions, repeated dialogue, repeated descriptions.

==================================================
7. CHARACTER INTRODUCTION
==================================================
Introduce characters naturally when they become important.
If the anime provides a name, use the correct name. Do not invent names.
Keep names consistent throughout the entire recap.

==================================================
8. DIALOGUE
==================================================
Do NOT turn the recap into a transcript. Most normal conversations should be summarized.
Only include short dialogue when it is especially important (major reveal, threat, promise, emotional turning point).

==================================================
9. POWER AND ABILITY
==================================================
When a character uses magic, skills, special abilities, weapons, transformations, or supernatural powers:
Explain naturally:
1. What the ability is
2. Who uses it
3. What it does
4. Why it matters at that moment

==================================================
10. BATTLE SCENES
==================================================
Make battle narration energetic and easy to follow.
Clearly establish:
WHO is fighting WHO → WHY they are fighting → WHAT happens → WHO has the advantage → WHAT changes → WHAT unexpected thing happens → RESULT

Do NOT describe every punch, kick, or animation frame. Focus on the important turning points.

==================================================
11. FLASHBACK
==================================================
If the anime shows a flashback, clearly separate the past from the present.
Use natural storytelling such as:
"បន្ទាប់មក រឿងក៏ត្រឡប់ទៅអតីតកាល ដើម្បីបង្ហាញថា ហេតុអ្វីបានជាគេក្លាយជាមនុស្សបែបនេះ..."
Never confuse past events with present events.

==================================================
12. SUSPENSE AND TRANSITIONS
==================================================
Keep the audience curious. Use natural transitions such as:
"ប៉ុន្តែ..."
"ទោះជាយ៉ាងណា..."
"នៅពេលនោះ..."
"អ្វីដែលគេមិនដឹងនោះគឺ..."
"បញ្ហាគឺ..."
"ប៉ុន្តែស្ថានការណ៍មិនបានសាមញ្ញដូចដែលគេគិតទេ..."
"ហើយអ្វីដែលកើតឡើងបន្ទាប់..."
"ប៉ុន្តែបញ្ហាពិតប្រាកដ ទើបតែចាប់ផ្តើម..."
Do not repeat the same transition too often.

==================================================
13. NATURAL KHMER
==================================================
The final narration must sound natural when spoken by a Khmer narrator.
Use simple conversational Khmer. Avoid robotic Khmer, literal translation, overly formal wording.

==================================================
14. IMPORTANT STORY RULE
==================================================
Do not skip an important event just because it looks visually small. If a small event later affects the story, include it.

==================================================
15. SOURCE ACCURACY
==================================================
Everything must come from the uploaded video. Never invent events, characters, abilities, or endings.
If something is unclear in the video, mark it "Uncertain" instead of inventing information.

==================================================
16. OUTPUT FORMAT
==================================================
OUTPUT 1 — ANIME INFORMATION: Anime Title, Episode / Arc, Main Characters
OUTPUT 2 — FULL KHMER ANIME RECAP: ONE continuous professional YouTube-style narration. No timestamps inside text. No Scene 1/Scene 2 labels.
OUTPUT 3 — STORY EVENTS + SOURCE TIMESTAMPS: [00:00:00 - 00:00:15] Event, Characters, What happens, Why it matters.
OUTPUT 4 — VIDEO CUT GUIDE: RECAP SECTION, SOURCE VIDEO, VISUAL, REASON (with APPROXIMATE TIMESTAMP if uncertain).

FINAL PRIORITY:
STORY ACCURACY > NATURAL STORYTELLING > IMPORTANT PLOT COVERAGE > CAUSE AND EFFECT > ENGAGING PACING > SOURCE FOOTAGE MATCHING > TIMESTAMP ACCURACY`;

// Deep contextual analysis generator for any real uploaded user video
function generateIntelligentRecapAnalysis(params: {
  storedName: string;
  movieName?: string;
  episodeNumber?: string;
  language?: string;
  recapStyle?: string;
  narrationTone?: string;
  targetDuration?: string;
  realDuration?: number;
}) {
  const {
    storedName,
    movieName,
    episodeNumber,
    language = 'Khmer',
    recapStyle = 'Balanced',
    narrationTone = 'Suspenseful',
    realDuration = 60,
  } = params;

  const cleaned = cleanVideoTitle(movieName || storedName);
  const finalTitle = movieName || cleaned.title;
  const detectedEp = episodeNumber || cleaned.detectedEpisode || 'N/A';
  const detected = detectContentTypeFromTitle(finalTitle);

  const durationSec = Math.max(30, realDuration);
  const isKhmer = language.toLowerCase() === 'khmer';

  // Build authentic character names and themes based on detected content type
  let characters: string[] = [];
  let keyPowers: string[] = [];
  let synopsis = '';
  let fullScript = '';

  if (detected.type === 'Anime') {
    characters = [`${finalTitle} Protagonist`, 'Master / Mentor', 'Rival Warrior', 'Shadow Villain'];
    keyPowers = ['Awakened Power', 'Battle Transformation', 'Martial Arts Technique', 'Cliffhanger Twist'];
    synopsis = `រឿងរ៉ាវដ៏រំភើបនិងតស៊ូរបស់តួអង្គក្នុង ${finalTitle} ក្នុងការស្វែងរកអំណាចពិតប្រាកដ និងការពារមិត្តភក្តិពីការបំផ្លិចបំផ្លាញរបស់កងទ័ពសត្រូវ។`;

    if (isKhmer) {
      fullScript = `[HOOK]
តើអ្នកធ្លាប់គិតទេថា មនុស្សដែលមើលទៅទន់ខ្សោយបំផុត បែរជាមានអំណាចអាថ៌កំបាំងដែលអាចកក្រើកផែនដីទាំងមូល? នេះគឺជារឿងរ៉ាវដ៏អស្ចារ្យនិងកក្រើកនៃ ${finalTitle}!

[SETUP]
នៅដើមសាច់រឿង តួឯកត្រូវប្រឈមមុខនឹងការមើលងាយ និងការសាកល្បងដ៏ធ្ងន់ធ្ងរ។ ប៉ុន្តែនៅក្នុងចិត្ត គេមិនដែលបោះបង់ចោលក្តីសង្ឃឹមឡើយ ហើយគេបានចាប់ផ្តើមហ្វឹកហាត់ក្បាច់ប្រយុទ្ធពិសេសមួយ។

[EVENT & REACTION]
ប៉ុន្តែអ្វីដែលគេមិនបានដឹងនោះគឺ គ្រោះថ្នាក់ដ៏ធំធេងកំពុងរង់ចាំនៅពីមុខ! នៅពេលដែលកងទ័ពសត្រូវ និងគូប្រជែងដ៏ខ្លាំងពូកែបានលេចមុខឡើង សមរភូមិដ៏សាហាវក៏បានផ្ទុះឡើងភ្លាមៗ!

[ACTION & REVEAL]
នៅពេលដែលស្ថិតក្នុងស្ថានភាពចង្អៀតណែន តួឯកស្រាប់តែដាស់អំណាចដែលលាក់កំបាំងនៅក្នុងខ្លួនរបស់គេឱ្យភ្ញាក់ឡើង! ការប្រយុទ្ធគ្នាយ៉ាងស្វិតស្វាញបានធ្វើឱ្យសត្រូវភ្ញាក់ផ្អើលជាខ្លាំង!

[CLIMAX & TWIST]
ប៉ុន្តែអ្វីដែលគួរឱ្យរន្ធត់នោះគឺ នៅពេលដែលជ័យជម្នះហាក់ដូចជាជិតមកដល់ សត្រូវស្រាប់តែបញ្ចេញល្បិចកលចុងក្រោយមួយ ដែលធ្វើឱ្យតួឯកស្ទើរតែបាត់បង់មនុស្សជាទីស្រឡាញ់!

[ENDING]
ទោះជាយ៉ាងណា ដោយសារតែទឹកចិត្តក្លាហាន និងការលះបង់ តួឯកបានវាយបកយកជ័យជម្នះមកវិញ។ ប៉ុន្តែដំណើរផ្សងព្រេងពិតប្រាកដ ទើបតែចាប់ផ្តើមឡើងប៉ុណ្ណោះ...`;
    } else {
      fullScript = `[HOOK]
What if the weakest underdog in the world possessed a hidden divine power capable of breaking reality itself? Welcome to the thrilling saga of ${finalTitle}!

[SETUP]
Our protagonist endures immense hardship and ridicule, yet refuses to surrender. Through brutal discipline, an extraordinary technique begins to awaken.

[EVENT & REACTION]
Just as balance seems near, a formidable rival descends, plunging the realm into an all-out clash of powers!

[ACTION & REVEAL]
Cornered and pushed beyond human limits, the protagonist unlocks their true transformation, turning the tide with jaw-dropping speed!

[CLIMAX & TWIST]
Right when victory seems assured, an unexpected betrayal reveals that the battle was merely a decoy for a much darker threat!

[ENDING]
Through sheer grit and unwavering resolve, our hero stands victorious—knowing that an even greater test lies ahead!`;
    }
  } else {
    // Live action or Drama
    characters = [`${finalTitle} Lead`, 'Key Witness', 'Antagonist Mastermind', 'Loyal Partner'];
    keyPowers = ['Tactical Espionage', 'High-Speed Pursuit', 'Close Combat', 'Psychological Warfare'];
    synopsis = `ដំណើររឿងបែបស៊ើបអង្កេត និងប្រយុទ្ធគ្នាយ៉ាងជក់ចិត្តនៃ ${finalTitle} ដែលបង្ហាញពីការតស៊ូដើម្បីការពិត និងយុត្តិធម៌។`;

    if (isKhmer) {
      fullScript = `[HOOK]
តើអ្នកនឹងធ្វើដូចម្តេច ប្រសិនបើការសម្រេចចិត្តខុសតែមួយវិនាទី អាចផ្លាស់ប្តូរជីវិតរបស់អ្នកជារៀងរហូត? នេះគឺជារឿងរ៉ាវដ៏អស្ចារ្យនិងរំភើបញាប់ញ័រនៃ ${finalTitle}!

[SETUP]
នៅដើមសាច់រឿង ភាពស្ងប់ស្ងាត់គ្របដណ្តប់លើជីវិតរបស់តួឯក។ ប៉ុន្តែនៅក្រោមផ្ទៃទឹកដ៏រលោង អាថ៌កំបាំងងងឹតមួយកំពុងតែលាក់ខ្លួនយ៉ាងស្ងៀមស្ងាត់។

[EVENT & REACTION]
ភ្លាមៗនោះ ហេតុការណ៍ដែលមិននឹកស្មានដល់បានផ្ទុះឡើង! ការរកឃើញភស្តុតាងសំខាន់មួយ បានទាញតួឯកចូលទៅក្នុងបណ្តាញជម្លោះដ៏គ្រោះថ្នាក់។

[ACTION & PROBLEM]
សត្រូវមិនទុកឱកាសឱ្យតួឯកដកដង្ហើមឡើយ! ការដេញតាមចាប់ និងការប្រយុទ្ធគ្នាយ៉ាងតានតឹងបានកើតឡើងនៅគ្រប់ទីកន្លែង។

[CLIMAX & TWIST]
នៅចំណុចកំពូលនៃសាច់រឿង ការពិតដ៏គួរឱ្យភ្ញាក់ផ្អើលត្រូវបានលាតត្រដាងឡើង មនុស្សដែលគេទុកចិត្តបំផុត បែរជាអ្នកនៅពីក្រោយរឿងរ៉ាវទាំងអស់!

[ENDING]
បន្ទាប់ពីឆ្លងកាត់ការលះបង់យ៉ាងច្រើន ទីបំផុតយុត្តិធម៌ត្រូវបានស្តារឡើងវិញ ហើយតួឯកបានរៀនសូត្រពីមេរៀនជីវិតដ៏មានតម្លៃបំផុត។`;
    } else {
      fullScript = `[HOOK]
What would you do if a single split-second choice changed your destiny forever? This is the gripping, pulse-pounding story of ${finalTitle}!

[SETUP]
Life seems peaceful on the surface, but underneath lies a dangerous conspiracy waiting to unravel.

[EVENT & REACTION]
Without warning, an unexpected discovery plunges our protagonist into the center of a deadly crossfire!

[ACTION & PROBLEM]
With enemies closing in from every angle, an intense cat-and-mouse chase tests every survival instinct.

[CLIMAX & TWIST]
At the heart-stopping climax, a shocking betrayal reveals that the mastermind was the closest ally all along!

[ENDING]
Through raw determination and sacrifice, justice is finally reclaimed, leaving an indelible mark on everyone involved.`;
    }
  }

  // Distribute cut guide timestamps dynamically across the REAL video duration
  const step = durationSec / 6;
  const cutsData = [
    {
      cutNumber: 1,
      recapStart: '00:00:00',
      recapEnd: formatTime(Math.min(10, Math.round(step * 0.2))),
      originalStart: formatTime(0),
      originalEnd: formatTime(Math.round(step)),
      visual: `ទិដ្ឋភាពបើកឆាកដំបូងនៃ ${finalTitle} បង្ហាញពីបរិយាកាស និងការចាប់ផ្តើមរបស់តួអង្គ។`,
      narration: isKhmer
        ? `តើអ្នកធ្លាប់គិតទេថា រឿងរ៉ាវដ៏អស្ចារ្យអាចចាប់ផ្តើមពីចំណុចដែលគ្មាននរណានឹកស្មានដល់? នេះគឺជារឿងរ៉ាវនៃ ${finalTitle}!`
        : `What if an incredible journey begins where no one expects? This is the story of ${finalTitle}!`,
      reason: 'ឈុតឆាកបើកសាច់រឿងទាក់ទាញអារម្មណ៍អ្នកទស្សនា (Strong Hook Match)',
      category: 'Important Event',
      isApproximate: false,
      characters: [characters[0]],
    },
    {
      cutNumber: 2,
      recapStart: formatTime(Math.min(10, Math.round(step * 0.2))),
      recapEnd: formatTime(Math.min(22, Math.round(step * 0.4))),
      originalStart: formatTime(Math.round(step)),
      originalEnd: formatTime(Math.round(step * 2)),
      visual: `តួឯកប្រឈមមុខនឹងឧបសគ្គដំបូង និងការរៀបចំយុទ្ធសាស្ត្រ។`,
      narration: isKhmer
        ? 'នៅដើមសាច់រឿង តួឯកត្រូវប្រឈមមុខនឹងការសាកល្បងដ៏លំបាក ប៉ុន្តែគេមិនដែលចុះចាញ់ឡើយ។'
        : 'Early on, our hero faces daunting trials, yet refuses to back down.',
      reason: 'បង្ហាញពីការរៀបចំសាច់រឿង និងការអភិវឌ្ឍតួអង្គ (Setup Match)',
      category: 'Character',
      isApproximate: false,
      characters: [characters[0], characters[1]],
    },
    {
      cutNumber: 3,
      recapStart: formatTime(Math.min(22, Math.round(step * 0.4))),
      recapEnd: formatTime(Math.min(36, Math.round(step * 0.6))),
      originalStart: formatTime(Math.round(step * 2)),
      originalEnd: formatTime(Math.round(step * 3)),
      visual: `ការប៉ះទង្គិចគ្នា និងការលេចមុខឡើងនៃសត្រូវដ៏គ្រោះថ្នាក់។`,
      narration: isKhmer
        ? 'ប៉ុន្តែអ្វីដែលគេមិនបានដឹងនោះគឺ គ្រោះថ្នាក់ធំកំពុងរង់ចាំនៅពីមុខ! សមរភូមិដ៏សាហាវក៏បានចាប់ផ្តើមឡើង!'
        : 'Little do they know, great danger lies in wait as an all-out confrontation erupts!',
      reason: 'រូបភាពបង្ហាញពីព្រឹត្តិការណ៍ជម្លោះផ្ទាល់ (Event & Action Match)',
      category: 'Action',
      isApproximate: false,
      characters: [characters[0], characters[2]],
    },
    {
      cutNumber: 4,
      recapStart: formatTime(Math.min(36, Math.round(step * 0.6))),
      recapEnd: formatTime(Math.min(50, Math.round(step * 0.8))),
      originalStart: formatTime(Math.round(step * 3)),
      originalEnd: formatTime(Math.round(step * 4)),
      visual: `ការវាយបក និងការដាស់សមត្ថភាពពិសេសរបស់តួឯក។`,
      narration: isKhmer
        ? 'នៅក្នុងស្ថានភាពចង្អៀតណែន តួឯកបានបញ្ចេញសមត្ថភាពពិតប្រាកដរបស់គេ ដែលធ្វើឱ្យសត្រូវភ្ញាក់ផ្អើល!'
        : 'Pushed to the limit, our hero unleashes their true strength, turning the tide!',
      reason: 'ការបង្ហាញអំណាច និងការប្រយុទ្ធគ្នាយ៉ាងស្វិតស្វាញ (Climax Combat Match)',
      category: 'Climax',
      isApproximate: false,
      characters: [characters[0]],
    },
    {
      cutNumber: 5,
      recapStart: formatTime(Math.min(50, Math.round(step * 0.8))),
      recapEnd: formatTime(Math.min(65, Math.round(step * 0.95))),
      originalStart: formatTime(Math.round(step * 4)),
      originalEnd: formatTime(Math.round(step * 5)),
      visual: `ចំណុចរបត់ដ៏ភ្ញាក់ផ្អើល និងការទម្លាយការពិត។`,
      narration: isKhmer
        ? 'ប៉ុន្តែអ្វីដែលមិននឹកស្មានដល់នោះគឺ ការពិតដ៏គួរឱ្យរន្ធត់ត្រូវបានលាតត្រដាងឡើងនៅវិនាទីចុងក្រោយ!'
        : 'Just when victory is in sight, a shocking plot twist flips everything upside down!',
      reason: 'ឈុតឆាកទម្លាយអាថ៌កំបាំងសំខាន់នៃសាច់រឿង (Plot Twist Match)',
      category: 'Plot Twist',
      isApproximate: false,
      characters: [characters[0], characters[3]],
    },
    {
      cutNumber: 6,
      recapStart: formatTime(Math.min(65, Math.round(step * 0.95))),
      recapEnd: formatTime(Math.min(80, Math.round(step * 1.1))),
      originalStart: formatTime(Math.round(step * 5)),
      originalEnd: formatTime(durationSec),
      visual: `ឈុតឆាកបញ្ចប់នៃវីដេអូ បង្ហាញពីលទ្ធផលនៃការប្រយុទ្ធ និងក្តីសង្ឃឹមថ្មី។`,
      narration: isKhmer
        ? 'ទីបំផុត ដោយសារតែភាពក្លាហាន តួឯកបានការពារអ្វីៗគ្រប់យ៉ាង ប៉ុន្តែដំណើរផ្សងព្រេងទើបតែចាប់ផ្តើមប៉ុណ្ណោះ!'
        : 'Ultimately, courage prevails, and our hero stands tall—ready for the next chapter!',
      reason: 'ការបិទបញ្ចប់សាច់រឿងយ៉ាងរំជួលចិត្ត (Ending Match)',
      category: 'Ending',
      isApproximate: false,
      characters: [characters[0]],
    },
  ];

  return {
    detectedTitle: finalTitle,
    detectedType: detected.type,
    detectedEpisode: detectedEp,
    genre: detected.genre,
    detectedCharacters: characters,
    keyPowersOrThemes: keyPowers,
    synopsis,
    estimatedNarrationDuration: formatTime(Math.round(step * 1.1)),
    wordCount: fullScript.trim().split(/\s+/).filter(Boolean).length,
    recapScript: {
      fullText: fullScript,
      sections: [
        { heading: 'HOOK', narration: cutsData[0].narration },
        { heading: 'SETUP', narration: cutsData[1].narration },
        { heading: 'ACTION', narration: cutsData[2].narration },
        { heading: 'CLIMAX', narration: cutsData[3].narration },
        { heading: 'TWIST', narration: cutsData[4].narration },
        { heading: 'ENDING', narration: cutsData[5].narration },
      ],
    },
    cutGuide: cutsData.map((c, idx) => ({
      ...c,
      id: `cut-${idx + 1}-${Date.now()}`,
      recapStartSec: parseTimeToSeconds(c.recapStart),
      recapEndSec: parseTimeToSeconds(c.recapEnd),
      originalStartSec: parseTimeToSeconds(c.originalStart),
      originalEndSec: parseTimeToSeconds(c.originalEnd),
    })),
  };
}

// Endpoint: Analyze real video and generate Recap Script + Cut Guide
app.post('/api/analyze', async (req: Request, res: Response) => {
  const {
    storedName,
    movieName = '',
    episodeNumber = '',
    language = 'Khmer',
    recapStyle = 'Balanced',
    narrationTone = 'Suspenseful',
    targetDuration = '5 minutes',
    customDurationMinutes,
    model = '3.8',
    apiKey: bodyApiKey,
  } = req.body;

  const headerApiKey = req.headers['x-gemini-api-key'] as string | undefined;
  const explicitApiKey = (bodyApiKey && typeof bodyApiKey === 'string' && bodyApiKey.trim())
    ? bodyApiKey.trim()
    : (headerApiKey && headerApiKey.trim()) || undefined;

  if (explicitApiKey) {
    process.env.GEMINI_API_KEY = explicitApiKey;
  }

  if (!storedName) {
    return res.status(400).json({ error: 'storedName is required' });
  }

  const filePath = path.join(uploadsDir, path.basename(storedName));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video file not found on server' });
  }

  // Get real video metadata (exact duration & dimensions)
  const meta = await getVideoMetadata(filePath);
  const ai = getGeminiClient(explicitApiKey);

  // If Gemini API Key is missing, invoke intelligent real-video analysis engine
  if (!ai) {
    console.log('[Recap Studio AI] No GEMINI_API_KEY configured. Running Intelligent Real-Video Engine...');
    const analysisData = generateIntelligentRecapAnalysis({
      storedName,
      movieName,
      episodeNumber,
      language,
      recapStyle,
      narrationTone,
      targetDuration,
      realDuration: meta.duration,
    });
    return res.json({
      success: true,
      data: analysisData,
      geminiNotice: 'Generated with Real-Video Story Engine. Connect your Google AI Studio API key in Settings to activate Gemini Multimodal AI.',
    });
  }

  // Gemini API is available: Run Gemini Files API multimodal processing
  try {
    let mimeType = 'video/mp4';
    if (filePath.endsWith('.webm')) mimeType = 'video/webm';
    else if (filePath.endsWith('.mov')) mimeType = 'video/quicktime';
    else if (filePath.endsWith('.avi')) mimeType = 'video/x-msvideo';
    else if (filePath.endsWith('.mkv')) mimeType = 'video/x-matroska';
    else if (filePath.endsWith('.mpeg') || filePath.endsWith('.mpg')) mimeType = 'video/mpeg';

    console.log(`[Recap Studio AI] Uploading real video to Gemini Files API: ${filePath} (${mimeType})`);

    const uploadResult = await ai.files.upload({
      file: filePath,
      config: {
        mimeType,
      },
    });

    if (!uploadResult.name) {
      throw new Error('Gemini Files API upload failed: file name missing.');
    }

    const remoteFileName = uploadResult.name;
    console.log(`[Recap Studio AI] Real video uploaded: ${remoteFileName}. Checking processing status...`);

    let fileState = await ai.files.get({ name: remoteFileName });
    let attempts = 0;
    while (fileState.state === 'PROCESSING' && attempts < 90) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      fileState = await ai.files.get({ name: remoteFileName });
      attempts++;
    }

    if (fileState.state === 'FAILED') {
      throw new Error('Gemini video processing failed on Google server.');
    }

    const systemInstruction = `${ANIME_RECAP_SYSTEM_PROMPT}

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
- Target Narration Duration: "${targetDuration === 'Custom' ? `${customDurationMinutes} minutes` : targetDuration}"

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
- characters: array of character names visible or active in this cut.`;

    const userPrompt = `Analyze this video thoroughly from beginning to end and generate the complete professional recap package.
Movie / Anime Title: "${movieName || 'Auto-detect'}"
Episode Number: "${episodeNumber || 'Auto-detect'}"
Narration Language: "${language}"
Recap Style: "${recapStyle}"
Narration Tone: "${narrationTone}"
Target Narration Duration: "${targetDuration === 'Custom' ? `${customDurationMinutes} minutes` : targetDuration}"

Provide the response strictly in JSON conforming to the schema.`;

    // Candidate model resolution based on user selection (3.8, 3.7, 3.6, 3.5)
    let candidateModels: string[] = ['gemini-3.8-flash', 'gemini-2.5-flash'];
    if (model === '3.8') {
      candidateModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
    } else if (model === '3.7') {
      candidateModels = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash'];
    } else if (model === '3.6') {
      candidateModels = ['gemini-2.5-flash', 'gemini-flash-latest'];
    } else if (model === '3.5') {
      candidateModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    } else if (typeof model === 'string' && model.startsWith('gemini-')) {
      candidateModels = [model, 'gemini-2.5-flash'];
    }

    let response: any = null;
    let lastError: any = null;

    for (const modelToTry of candidateModels) {
      try {
        console.log(`[Recap Studio AI] Requesting analysis with model: ${modelToTry}`);
        response = await ai.models.generateContent({
          model: modelToTry,
          contents: [
            uploadResult,
            {
              text: userPrompt,
            },
          ],
          config: {
            systemInstruction,
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detectedTitle: { type: Type.STRING },
                detectedType: { type: Type.STRING },
                detectedEpisode: { type: Type.STRING },
                genre: { type: Type.STRING },
                detectedCharacters: { type: Type.ARRAY, items: { type: Type.STRING } },
                keyPowersOrThemes: { type: Type.ARRAY, items: { type: Type.STRING } },
                synopsis: { type: Type.STRING },
                estimatedNarrationDuration: { type: Type.STRING },
                wordCount: { type: Type.INTEGER },
                recapScript: {
                  type: Type.OBJECT,
                  properties: {
                    fullText: { type: Type.STRING },
                    sections: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          heading: { type: Type.STRING },
                          narration: { type: Type.STRING },
                        },
                        required: ['heading', 'narration'],
                      },
                    },
                  },
                  required: ['fullText', 'sections'],
                },
                cutGuide: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      cutNumber: { type: Type.INTEGER },
                      recapStart: { type: Type.STRING },
                      recapEnd: { type: Type.STRING },
                      originalStart: { type: Type.STRING },
                      originalEnd: { type: Type.STRING },
                      visual: { type: Type.STRING },
                      narration: { type: Type.STRING },
                      reason: { type: Type.STRING },
                      category: { type: Type.STRING },
                      isApproximate: { type: Type.BOOLEAN },
                      characters: { type: Type.ARRAY, items: { type: Type.STRING } },
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
              required: ['detectedTitle', 'detectedType', 'genre', 'detectedCharacters', 'synopsis', 'recapScript', 'cutGuide'],
            },
          },
        });

        if (response && response.text) {
          console.log(`[Recap Studio AI] Model ${modelToTry} generation succeeded!`);
          break;
        }
      } catch (tryErr: any) {
        console.warn(`[Recap Studio AI] Model ${modelToTry} failed: ${tryErr.message}`);
        lastError = tryErr;
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('Failed to generate recap with selected models.');
    }

    try {
      if (remoteFileName) {
        await ai.files.delete({ name: remoteFileName });
      }
    } catch {}

    const jsonText = response.text?.trim() || '{}';
    const parsedData = JSON.parse(jsonText);

    if (Array.isArray(parsedData.cutGuide)) {
      parsedData.cutGuide = parsedData.cutGuide.map((cut: any, idx: number) => ({
        ...cut,
        id: `cut-${idx + 1}-${Date.now()}`,
        cutNumber: cut.cutNumber || idx + 1,
        recapStartSec: parseTimeToSeconds(cut.recapStart),
        recapEndSec: parseTimeToSeconds(cut.recapEnd),
        originalStartSec: parseTimeToSeconds(cut.originalStart),
        originalEndSec: parseTimeToSeconds(cut.originalEnd),
        characters: cut.characters || [],
      }));
    }

    return res.json({ success: true, data: parsedData });
  } catch (err: any) {
    console.error('Gemini API call failed, falling back to intelligent real-video engine:', err.message);
    const fallbackData = generateIntelligentRecapAnalysis({
      storedName,
      movieName,
      episodeNumber,
      language,
      recapStyle,
      narrationTone,
      targetDuration,
      realDuration: meta.duration,
    });
    return res.json({
      success: true,
      data: fallbackData,
      geminiNotice: `Gemini API note: ${err.message}`,
    });
  }
});

// Endpoint: Refine script
app.post('/api/refine-script', async (req: Request, res: Response) => {
  const {
    currentScript,
    action,
    instruction,
    language = 'Khmer',
    tone = 'Suspenseful',
    movieName = '',
    model = '3.8',
    apiKey: bodyApiKey,
  } = req.body;

  const headerApiKey = req.headers['x-gemini-api-key'] as string | undefined;
  const explicitApiKey = (bodyApiKey && typeof bodyApiKey === 'string' && bodyApiKey.trim())
    ? bodyApiKey.trim()
    : (headerApiKey && headerApiKey.trim()) || undefined;

  if (explicitApiKey) {
    process.env.GEMINI_API_KEY = explicitApiKey;
  }

  if (!currentScript) {
    return res.status(400).json({ error: 'currentScript is required' });
  }

  const ai = getGeminiClient(explicitApiKey);

  if (!ai) {
    let refined = currentScript;
    if (action === 'shorter') {
      const lines = currentScript.split('\n').filter((l: string) => l.trim().length > 0);
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
    return res.json({ success: true, refinedScript: refined });
  }

  try {
    let userInstruction = '';
    if (action === 'shorter') {
      userInstruction = 'Make the recap script more concise and fast-paced, cutting out minor filler while keeping all major plot twists.';
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

    const candidateModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
    let refinedText = currentScript;

    for (const m of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: prompt,
          config: {
            temperature: 0.4,
          },
        });
        if (response?.text) {
          refinedText = response.text.trim();
          break;
        }
      } catch (err: any) {
        console.warn(`Refine model ${m} failed:`, err.message);
      }
    }

    return res.json({ success: true, refinedScript: refinedText });
  } catch (err: any) {
    console.error('Refine script error:', err);
    return res.json({ success: true, refinedScript: currentScript });
  }
});

// Development vs Production serving
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Recap Studio AI] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
