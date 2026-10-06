# Recap Studio AI — Cloudflare Workers backend

Backend សម្រាប់ **Recap Studio AI** ដែលដំណើរការលើ **Cloudflare Workers** ។
Folder នេះជំនួស `server.ts` (Express + multer + ffprobe + folder `uploads/`) ទាំងស្រុង
ដោយប្រើ **R2** សម្រាប់ផ្ទុកវីដេអូ និង **Gemini REST API** សម្រាប់វិភាគវីដេអូ។

API contract ដូចគ្នា ១០០% ជាមួយ Express ដូច្នេះ frontend (`src/`) ដំណើរការជាមួយទាំងពីរ។
`server.ts` ដើម **មិនត្រូវបានប៉ះពាល់** — `npm run dev` នៅតែប្រើ Express ដូចដើម។

---

## ១. អ្វីដែលបានផ្លាស់ប្តូរ និងហេតុអ្វី

| Express (`server.ts`) | Cloudflare Worker (`worker/`) | ហេតុអ្វី |
|---|---|---|
| `multer` + folder `uploads/` | **R2 bucket** (stream ចូលផ្ទាល់) | Workers គ្មាន filesystem |
| `ffprobe` (child_process) | បង្កើត **MP4 parser** អាន `moov/mvhd/tkhd` + browser វាស់ `duration` | Workers គ្មាន child_process |
| `fs.createReadStream` សម្រាប់ Range | **R2 range read** → `206 Partial Content` | Seek ក្នុង player នៅតែដំណើរការ |
| `@google/genai` SDK | **Gemini REST API** (`fetch`) | SDK ត្រូវការ Node APIs |
| `/api/analyze` ចម្លើយក្នុង request តែមួយ (រហូត ២៧០ វិនាទី) | **Job + polling** (`pending → uploading → processing → generating → done`) | Cloudflare កាត់ request នៅ ~១០០ វិនាទី (524) |
| រក្សា key ក្នុង `process.env` | រក្សាក្នុង **R2** (`_config/`) ឬ `wrangler secret` | `process.env` សរសេរមិនបាននៅ Workers |

---

## ២. រចនាសម្ព័ន្ធ (Architecture)

```
Browser (React SPA)
   │
   ├─ GET  /api/samples ──────────────► បញ្ជីវីដេអូគំរូ
   ├─ POST /api/upload ───────────────► R2  (stream → multipart upload 8MB/part)
   ├─ POST /api/upload-url ───────────► ទាញពី URL → R2 (stream)
   ├─ GET  /api/video/:name ──────────► R2  (Range/206 + Accept-Ranges)
   ├─ POST /api/analyze ──────────────► បង្កើត job → { jobId }
   │      └─ GET /api/analyze/job/:id ► advance job ម្តងមួយជំហាន (ក្នុង ៤៥ វិនាទី/request)
   │             ├── chunk 8MB → Gemini resumable upload (/upload/v1beta/files)
   │             ├── poll files.get រហូតដល់ state = ACTIVE
   │             └── generateContent (ដំណើរការក្នុង ctx.waitUntil)
   └─ POST /api/refine-script ────────► Gemini (text តែប៉ុណ្ណោះ)
```

**ហេតុអ្វីត្រូវការ job?** Workers មិនអាចរក្សា connection បើករហូតដល់ ៥ នាទីបានទេ។
ដូច្នេះការងារត្រូវបានរក្សាទុកក្នុង R2 (`jobs/<id>.json`) ហើយ browser ធ្វើ poll
ដើម្បីរុញការងារទៅមុខម្តងមួយជំហាន។ ជំហានបង្កើតសាច់រឿង (`generateContent`)
ដំណើរការក្នុង `ctx.waitUntil()` ដូច្នេះមិនធ្វើឱ្យ request ដាច់ឡើយ។

---

## ៣. ជំហាន Deploy (ចាំបាច់)

```bash
# ១. តម្លើង dependencies របស់ worker
cd worker
npm install

# ២. ចូល Cloudflare (បើក browser ម្តងគត់)
npx wrangler login

# ៣. បង្កើត R2 bucket (ឈ្មោះត្រូវដូចក្នុង wrangler.toml)
npx wrangler r2 bucket create recaps-pro-videos

# ៤. (ណែនាំ) ដាក់វីដេអូគំរូ ៣ ចូល R2
npm run samples:upload

# ៥. (ជម្រើស) ដាក់ Gemini API key ជា secret របស់ Worker
npx wrangler secret put GEMINI_API_KEY

# ៦. Build frontend + deploy
npm run deploy          # = vite build (ពី root) + wrangler deploy
```

បន្ទាប់ពី deploy រួច Wrangler នឹងបង្ហាញ URL ដូចជា
`https://recaps-pro.<your-subdomain>.workers.dev` — បើក URL នោះ បានទាំង UI និង API
(គឺ deploy តែមួយសម្រាប់ទាំងអស់)។

> **R2 bucket ចាំបាច់ទេ?** ចាំបាច់សម្រាប់ `/api/upload`, `/api/video`, និង `/api/analyze`។
> បើមិនទាន់ដាក់ bucket ទេ Worker នឹងឆ្លើយជា error ច្បាស់លាស់ (មិន crash) ហើយ
> `GET /api/health` នឹងបង្ហាញ `"storage": "unbound"`។

### ការដាក់ Gemini API key — មាន ២ វិធី

1. **តាម UI** — បើក Settings → បញ្ចូល key → ប៊ូតុង Save។
   Worker ផ្ទៀងផ្ទាត់ជាមួយ Google ហើយរក្សាទុកក្នុង R2 (`_config/gemini-api-key.json`)។
   (បើគ្មាន R2 bucket វានឹងនៅក្នុង memory របស់ Worker ប៉ុណ្ណោះ + ក្នុង localStorage)
2. **តាម secret** — `npx wrangler secret put GEMINI_API_KEY` → ប្រើសម្រាប់អ្នកប្រើទាំងអស់។

---

## ៤. Local development

```bash
cd worker
cp .dev.vars.example .dev.vars     # ដាក់ key បើចង់ (មិនចាំបាច់)
npm run dev                        # build frontend រួចបើក wrangler dev
# បើក http://127.0.0.1:8787
```

បើចង់ដំណើរការ API តែប៉ុណ្ណោះ (មិន build frontend)៖ `npm run dev:api`

---

## ៥. API Endpoints

| Method | Path | កំណត់សម្គាល់ |
|---|---|---|
| GET | `/api/health` | ពិនិត្យ deployment (storage, key, assets) |
| GET | `/api/samples` | បញ្ជីវីដេអូគំរូ |
| GET / POST | `/api/api-key-status`, `/api/set-api-key` | គ្រប់គ្រង key |
| POST | `/api/upload` | `multipart/form-data` (`video` + `durationSec`/`width`/`height`) ឬ raw body + query params |
| POST | `/api/upload-url` | Import ពី URL ឬ sample |
| GET / HEAD | `/api/video/:filename` | គាំទ្រ `Range` → `206`, `416`, `Accept-Ranges` |
| POST | `/api/analyze` | ចម្លើយភ្លាមៗ បើគ្មាន key (offline engine); បើមាន key → `{ jobId }` |
| GET / POST | `/api/analyze/job/:jobId` | Poll + រុញការងារទៅមុខ |
| DELETE | `/api/analyze/job/:jobId` | បោះបង់ + លុប job |
| POST | `/api/refine-script` | កែសាច់រឿង (text only) |

**កំណត់សម្គាល់ poll:** ត្រូវផ្ញើ `x-gemini-api-key` ជាមួយរាល់ការហៅ poll
(បើ key មកពី browser) ព្រោះ key **មិនត្រូវបានរក្សាទុក** លើ server។
`src/utils/apiClient.ts` ធ្វើការនេះជាស្វ័យប្រវត្តិ។

---

## ៦. ដែនកំណត់ដែលត្រូវដឹង (Limits)

| ចំណុច | ដែនកំណត់ | ដំណោះស្រាយ |
|---|---|---|
| Body size ក្នុង ១ request | **១០០ MB** (Cloudflare) | កាត់វីដេអូខ្លី ឬប្រើ `/api/upload-url` (stream ចូល R2 ដោយគ្មាន limit នេះ) |
| ទំហំឯកសារសម្រាប់ Gemini | **២ GB** | Gemini Files API limit |
| Request យូរបំផុត | ~១០០ វិនាទី | ប្រើ job polling (រួចហើយ) |
| Gemini រក្សាឯកសារ | ៤៨ ម៉ោង | Worker លុបជូនបន្ទាប់ពីបង្កើតរួច (`files.delete`) |
| R2 free tier | ១០ GB ផ្ទុក, ១ លាន Class A/ប្រចាំខែ | គ្រប់គ្រាន់សម្រាប់ការសាកល្បង |
| CPU time | ៣០ វិនាទី (free) / ៥ នាទី (paid) | កូដយើងរង់ចាំ I/O ស្ទើរតែទាំងអស់ → មិនជិតដល់ limit |
| R2 multipart part តូចបំផុត | ៥ MB (លើកលែង part ចុងក្រោយ) | យើងប្រើ **៨ MB** ក្នុងមួយ part |

> វីដេអូធំជាង ១០០ MB៖ ប្រើ URL import ឬបំបែកជាផ្នែក។ បើត្រូវការផ្ទុកធំជាងនេះ
> អាចប្រើ **R2 presigned URL / multipart ពី browser ផ្ទាល់** បាន (មិនទាន់ធ្វើ)។

---

## ៧. ការផ្ទៀងផ្ទាត់ (Smoke test)

```bash
# Terminal ១ — dev server
cd worker && npm run dev

# Terminal ២ — តេស្ត endpoint សំខាន់ៗ (upload, range, analyze, job)
npm run smoke
```

សម្រាប់តេស្ត **ជំហាន Gemini ទាំងមូលដោយមិនចាំបាច់មាន API key** (ប្រើ mock)៖

```bash
# Terminal ១
node worker/test/mock-gemini.mjs

# Terminal ២
cd worker && npx wrangler dev --var GEMINI_API_BASE:http://127.0.0.1:8899

# Terminal ៣
npm run smoke -- --with-mock
```

---

## ៨. ដោះស្រាយបញ្ហា (Troubleshooting)

| បញ្ហា | មូលហេតុ / ដំណោះស្រាយ |
|---|---|
| `R2 bucket is not configured` | បង្កើត bucket ឬពិនិត្យ `[[r2_buckets]]` ក្នុង `wrangler.toml` |
| `413 PAYLOAD_TOO_LARGE` | វីដេអូធំជាង ១០០ MB → ប្រើ URL import ឬកាត់វីដេអូ |
| `Sample video not found in the R2 bucket` | រត់ `npm run samples:upload` |
| `The Gemini API key…was not resent` | Browser ត្រូវផ្ញើ header `x-gemini-api-key` ពេល poll (ធ្វើដោយ `apiClient.ts`) |
| Job ដូចជាគាំងនៅ `generating` | Worker រង់ចាំ ~៤ នាទី រួចព្យាយាមម្តងទៀត (អតិបរមា ២ ដង) បន្ទាប់មកប្រើ offline engine ជូនជំនួស |
| `npm install` ក្នុង root បរាជ័យ (esbuild/vite) | បញ្ហាចាស់របស់ repo → ប្រើ `npm install --legacy-peer-deps` ឬ `bun install` |
| Key បាត់បន្ទាប់ពី deploy ថ្មី | ដាក់ជា `wrangler secret put GEMINI_API_KEY` ឬបញ្ចូលម្តងទៀតក្នុង Settings |

---

## ៩. រចនាសម្ព័ន្ធឯកសារ

```
worker/
├─ wrangler.toml           # assets + R2 binding + vars
├─ package.json            # scripts: dev, deploy, smoke, samples:upload
├─ scripts/
│  └─ upload-samples.mjs   # ដាក់វីដេអូគំរូ ៣ ចូល R2
├─ test/
│  ├─ mock-gemini.mjs      # Gemini API ក្លែងក្លាយ (សម្រាប់តេស្តដោយគ្មាន key)
│  └─ smoke-test.mjs       # តេស្ត endpoint សំខាន់ៗ
└─ src/
   ├─ index.ts             # Router + error handling
   ├─ types.ts             # Env, AnalyzeJob, …
   ├─ lib/
   │  ├─ storage.ts        # R2: វីដេអូ, job, key (ជំនួស fs/uploads)
   │  ├─ multipart.ts      # Streaming multipart parser (ជំនួស multer)
   │  ├─ videoMeta.ts      # MP4 moov parser (ជំនួស ffprobe)
   │  ├─ gemini.ts         # Gemini REST (ជំនួស @google/genai)
   │  ├─ analysisSpec.ts   # Prompt + JSON schema
   │  ├─ fallback.ts       # Offline "Real-Video Story Engine" (port ពី server.ts)
   │  ├─ prompts.ts        # ANIME_RECAP_SYSTEM_PROMPT (ដូចដើម)
   │  ├─ keys.ts, http.ts, errors.ts, sleep.ts, time.ts, titles.ts, samples.ts
   └─ routes/
      ├─ samples.ts, apiKey.ts, upload.ts, uploadUrl.ts,
      ├─ video.ts          # Range streaming
      ├─ analyze.ts        # Job engine (ជំហានទាំង ៤)
      └─ refineScript.ts
```
