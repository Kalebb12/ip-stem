# SenseAtlas

**Anatomy diagrams that blind and low-vision students can explore on their own.**

A teacher uploads an anatomy lecture (PDF or image). SenseAtlas finds each diagram, uses a vision AI model to turn it into structured content, and flags anything it is unsure about. The structured content lists every structure, where it sits, what it does, how it connects to its neighbours, the processes shown (such as the path of blood) and a set of practice questions. The teacher checks and edits the content, then publishes it. Students explore the diagram with a screen reader, a keyboard or large text, ask a learning companion questions answered from the approved lesson, and test themselves with a practice quiz.

This repository is the demo build of the first milestone: **from an anatomy PDF to independent learning**.

---

## What's in the demo

| Journey step | Where |
|---|---|
| Landing page explains the product and includes a live, keyboard-explorable heart | `/` |
| Teacher signs in, uploads a PDF or image | `/teacher/upload` |
| Pipeline extracts text, detects the diagram, reads it with AI and validates it | background job, `api/app/pipeline/` |
| Teacher reviews the diagram next to the generated content, resolves flags, approves and publishes | `/teacher/resources/:id` |
| Student opens the lesson: overview, structures, relationships, step-by-step blood flow | `/student/lessons/:id` |
| Student asks the learning companion (grounded in the approved lesson) | same page |
| Student takes an accessible practice quiz; progress is saved | same page |
| Accessibility settings: text size up to 200%, high contrast, dark, speech speed, verbosity, motion | `/settings` and the header |

Demo accounts (password `demo1234`): `teacher@demo.school` and `student@demo.school`. On first start the API seeds a published **The Human Heart** lesson, so the student journey works immediately. The sample lecture is at `samples/heart-lecture.pdf`.

## Quick start

Requirements: Python 3.11+ and Node 20+.

```bash
# 1. API (FastAPI, port 8000)
cd api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env            # then put your GROQ_API_KEY in .env
.venv/bin/python scripts/make_sample_pdf.py   # (re)generates samples/heart-lecture.pdf
.venv/bin/uvicorn app.main:app --port 8000

# 2. Web app (Next.js, port 3000), in another terminal
cd web
npm install
npm run dev
```

Open http://localhost:3000.

### AI configuration (Groq)

| Variable (`api/.env`) | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | empty | Enables live diagram reading and the AI companion |
| `GROQ_VISION_MODEL` | `qwen/qwen3.8-27b` | Reads diagrams (needs image input and JSON mode) |
| `GROQ_CHAT_MODEL` | `openai/gpt-oss-120b` | Learning companion answers |
| `DEMO_MODE` | `1` | If an AI call fails, fall back to built-in content instead of failing |
| `GROQ_TTS_MODEL` | `canopylabs/orpheus-v1-english` | Voice used when the browser has no voices (accept its terms once in the Groq console) |
| `GROQ_TTS_VOICE` | `hannah` | One of autumn, diana, hannah, austin, daniel, troy |
| `YARNGPT_API_KEY` | empty | Turns on **listening in Yorùbá, Igbo, Hausa and Naijá**: YarnGPT translates the lesson text and reads it with a Nigerian voice (every call costs credits; audio is cached) |
| `YARNGPT_VOICE` | empty | Optional fixed YarnGPT voice id; by default a voice that lists the language is picked from `GET /api/v1/voices` |

**Without a key, the app runs in demo mode.** The sample heart lecture gets pre-written, anatomically checked content (`api/app/pipeline/fixtures.py`). Other uploads get a skeleton that the teacher fills in, and the companion answers by keyword retrieval over the lesson. The landing page and teacher screens say which mode is active.

If Groq retires a model, change the model name in `.env`. Nothing else needs to change.

### UI check (Playwright)

With both servers running:

```bash
cd web && npm run test:ui
```

This drives the full journey in a real browser, mostly by keyboard:

1. Landing page and skip link.
2. Hero explorer using the arrow keys, including the live-region announcement.
3. Text at 150% and high contrast, with no horizontal scroll.
4. Mobile layout.
5. Teacher uploads the sample, waits for processing, resolves the flags, approves and publishes.
6. Student explores the lesson, asks the companion a question and completes the quiz.
7. Permission redirects.
8. No console errors.

Screenshots are saved to `screenshots/`.

---

## Deployment

Two services: the **API** (FastAPI, Docker) and the **web app** (Next.js, Docker or Vercel).

### Option A: one machine with Docker Compose (simplest)

```bash
# api/.env holds GROQ_API_KEY, YARNGPT_API_KEY, etc. (see api/.env.example)
docker compose up --build -d
# web on :3000, API on :8000, data kept in the "senseatlas-data" volume
```

For a public server, set where the browser will reach each service:

```bash
WEB_ORIGIN=https://senseatlas.example.com PUBLIC_API_URL=https://api.senseatlas.example.com docker compose up --build -d
```

### Option B: separate hosts (for example Railway, Render or Fly.io for the API, and Vercel for the web app)

**API**
```bash
docker build -f api/Dockerfile -t senseatlas-api .        # build from the repo root
docker run -p 8000:8000 --env-file api/.env \
  -e CORS_ORIGINS=https://your-web-app.example.com \
  -v senseatlas-data:/data senseatlas-api
```

| Setting | Value |
|---|---|
| Dockerfile | `api/Dockerfile`, build context = repository root |
| Port | `$PORT` (default 8000) |
| Health check | `GET /system` |
| Env vars | `GROQ_API_KEY`, `YARNGPT_API_KEY`, `CORS_ORIGINS` (the web app's URL, comma-separated), optional `GROQ_*`, `YARNGPT_VOICE`, `DEMO_MODE` |
| Volume | mount at `/data` (database, uploads, cached audio) |
| Instances | **exactly 1**: SQLite, processing jobs and audio tickets live in the process |

**Web**
```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://your-api.example.com -t senseatlas-web web
docker run -p 3000:3000 senseatlas-web
```

On Vercel, set the project root to `web/` and add the env var `NEXT_PUBLIC_API_URL=https://your-api.example.com`. It is read at **build** time, so redeploy after changing it. Then set the API's `CORS_ORIGINS` to the Vercel URL.

### Running without a volume

It works. On every start, the API recreates the demo accounts and the published heart lesson. Everything else lives in `/data` and is lost when the container restarts or redeploys:

- teacher uploads and edits
- registered accounts, student progress and quiz scores
- cached audio, so YarnGPT credits are spent again to regenerate it

Anyone signed in is signed out after a restart. Hosts that sleep idle free instances (such as Render's free tier) restart the container, and so reset the data, after about 15 minutes without traffic, followed by a slow cold start. Before a live demo, open the site a few minutes early, and pre-play the lesson in each language if you are not using a volume.

---

## Architecture

```
web/  Next.js 16 + React 19 + TypeScript (hand-written CSS design system)
  app/page.tsx                    landing page
  app/teacher/…                   dashboard, upload, processing + review editor
  app/student/…                   dashboard, lesson viewer
  components/Explorer.tsx         the accessible diagram explorer (tabs, roving list, process stepper)
  components/Companion.tsx        grounded Q&A with voice input
  components/Quiz.tsx             fieldset/legend quiz with announced feedback
  lib/prefs.tsx, announcer.tsx    display preferences, global live regions

api/  FastAPI + SQLModel (SQLite) + PyMuPDF + Groq
  app/main.py                     REST API and permission checks
  app/pipeline/extract.py         text, embedded images, vector figures, label text inside figures
  app/pipeline/interpret.py       vision model → structured JSON (with evidence + confidence)
  app/pipeline/validate.py        deterministic flags: unlabelled claims, unknown refs, low confidence…
  app/pipeline/qa.py              lesson-grounded companion
  app/pipeline/run.py             background job
  app/schemas.py                  the content contract (DiagramContent)
```

### Processing pipeline

1. **Extract.** PyMuPDF pulls the text of each page, the embedded raster images and the vector figures. It also reads the label text that sits physically inside each figure, which for digital PDFs is deterministic evidence of what is labelled.
2. **Detect.** Images smaller than 200px are ignored. Pages with many vector drawings get their drawing region rendered as a PNG.
3. **Interpret.** The vision model receives the image, the extracted labels, the caption and the lecture text inside `<lecture_text>` tags. The lecture text is marked as untrusted data, so instructions inside a document are ignored. The model returns JSON in the `DiagramContent` shape. Each structure carries an `evidence` value (`labelled`, `visible_unlabelled` or `inferred_from_text`) and a `confidence` value.
4. **Validate.** Rule-based checks flag:
   - structures marked `labelled` that don't match any label found in the figure
   - structures inferred from text only
   - low confidence
   - structures the lecture notes never mention
   - references to unknown structures
   - missing fields
   - quiz answers that are out of range
5. **Review.** The teacher can't approve while any flag is unchecked. Editing published content sends it back to review.

### Content model

`api/app/schemas.py` defines the content model. Each diagram has:

- an `overview`
- an `orientation_note` (anatomical position: the patient's left appears on the page's right)
- `structures[]`, each with location, function, neighbours, connections, and a `bbox` so low-vision users see the selected part outlined on the real diagram
- `processes[]`, made of ordered steps
- `quiz[]`

### API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Accounts (PBKDF2 hashes, bearer tokens) |
| GET/PUT | `/auth/me`, `/auth/me/prefs` | Profile and accessibility preferences |
| GET | `/system` | Whether live AI is enabled |
| POST | `/resources/upload` | Upload a PDF, PNG or JPG; starts processing |
| GET | `/resources`, `/resources/{id}`, `/resources/{id}/status` | Teacher's own resources (students: published only) |
| POST | `/resources/{id}/process` | Re-run the pipeline |
| GET | `/resources/{id}/diagrams` | Diagrams and their content |
| GET/PATCH | `/diagrams/{id}/content` | Read or edit content (optimistic version check) |
| GET | `/diagrams/{id}/image` | Diagram image (owner, or anyone if published) |
| POST | `/resources/{id}/approve`, `/publish`, `/withdraw` | Review workflow; approval blocked while flags are open |
| GET | `/lessons`, `/lessons/{id}` | Student view of published lessons (teacher preview of own drafts) |
| POST | `/lessons/{id}/questions` | Ask the companion |
| POST | `/lessons/{id}/progress`, `/lessons/{id}/quiz-attempts` | Learning progress |
| POST | `/tts` | English speech via Groq, for browsers without voices (cached WAV) |
| POST/GET | `/tts/ticket`, `/tts/audio/{key}` | Translated listening: YarnGPT translates and speaks; the MP3 streams through as it is generated, then is cached |

Interactive docs: http://localhost:8000/docs.

**Permissions:** teachers only ever see their own resources, and another teacher's ID returns 404, not 403. Students only see published lessons. Every endpoint checks the role.

## Accessibility decisions

- Native HTML first: real buttons, `fieldset`/`legend`, labelled inputs, tables with captions and scoped headers.
- One polite and one assertive live region for the whole app. Explorer moves, process steps, saves and quiz feedback are announced.
- The explorer uses the ARIA tabs pattern with arrow keys and a roving-tabindex structure list. "Go to a neighbouring structure" lets students walk through the anatomy spatially.
- A two-tone yellow-and-black focus ring that stays visible in every colour mode. Touch targets are at least 44px.
- Text scales to 200% (the setting is applied before first paint). There are high-contrast and dark modes, and both reduced-motion settings are respected.
- The typeface is Atkinson Hyperlegible Next, designed by the Braille Institute for low-vision readers.
- Speech with play, pause, start again and speed controls, for low-vision users and listeners. The browser's own voice is used when it has one. Otherwise, for example in Chrome on Linux, which ships with no voices, the app falls back to a Groq voice through `POST /tts`, with audio cached on the server. Screen-reader users keep their own reader.
- Listening language: students choose English, Yorùbá, Igbo, Hausa or Naijá in Settings or next to any Listen button. Non-English listening is translated by YarnGPT and streamed, so speech starts after about one sentence is ready (around 10 seconds the first time, instantly once cached). Each language gets its own voice: Idera for Yorùbá, Adaora for Igbo, Zainab for Hausa and Osagie for Naijá. The page warns that machine translation can get anatomy terms wrong.
- Pressing any key outside the listen controls stops the app's voice, so it never talks over a screen reader. The "I use a screen reader" setting hides the app's read-aloud buttons, except when a non-English listening language is chosen.
- Error messages say what happened and how to fix it. Form errors take focus.

The target is WCAG 2.2 AA. The automated UI check is not a substitute for testing with blind and low-vision users on NVDA, JAWS, VoiceOver and TalkBack.

## Known limits of this demo

- Scanned PDFs (OCR), PPTX and DOCX are not supported yet. Upload digital PDFs or images.
- There are no courses or enrolments: every student sees every published lesson.
- Processing runs in-process with FastAPI background tasks. Use Celery or Redis for production.
- The anatomy in the demo content should still be validated by a qualified anatomy educator before real use.
