# TalkWeave

Turn recordings of in-person technical talks and ordinary camera photos into detailed, illustrated, searchable notes with traceable evidence. Local-first capture and import prototype with a searchable notebook library, dark and light themes, and responsive evidence review. **No hosted deployment or account system.**

## Run locally

Requirements: Node.js 22.12+ (tested on 26.13), npm, and `ffmpeg` / `ffprobe` on PATH. On macOS, `brew install ffmpeg`; on Debian/Ubuntu, `sudo apt-get install ffmpeg`.

```sh
npm ci
cp -n .env.example .env
# Edit .env and set OPENAI_API_KEY. Keep this file private.
npm run dev
```

Open **http://127.0.0.1:3000**. The server binds to loopback only. `.env` takes precedence over inherited environment values; restart the server after changing it. Neither the key nor provider error payloads are sent to the browser. Vite hot reload covers the UI, not backend source changes.

For a production-mode local preview:

```sh
npm run build
npm start
```

The app stores sessions, original media, normalized playback audio, metadata-stripped display images, corrections, document revisions, and the test allowance ledger under `.data/` (or `DATA_DIR`). Run one server per data directory. `.env`, local sessions, generated fixtures, test results, and build output are ignored by Git.

## Use the workflow

1. Choose **New session** (or **Record or import**). Record directly with the device microphone, or import an existing audio file. Add slide photos after stopping capture. Files are saved locally before cloud processing. Set optional speaker/event metadata in session settings.
2. Set the actual recording start with an explicit UTC offset (for example `2026-11-07T18:00:00-05:00`), or leave it unknown. **File modification/upload times are never treated as capture times.** Set an assumed photo offset only if EXIF lacks one. For a phone three minutes fast, use a device correction of `-180` seconds.
3. If the audio combines recording intervals around pauses, enable the advanced interval editor. Each interval records absolute wall times and media offsets. Photos in gaps are unmatched; they are not assigned an exact audio counterpart.
4. Select **Create my notebook**. Audio windows and photo analyses checkpoint independently. Cancel/resume or retry failed stages without reimporting or replacing corrections.
5. Review detailed notes, transcript, and photos. Source chips play bounded evidence intervals. Correct technical terms or mark `[inaudible]` in the transcript. Adjust photo start/end seconds and save; manual matches survive new drafts and timing changes. Search applies to the active notebook view.
6. Edit section text and add explicitly labeled personal notes. New generation creates a separate proposed draft; compare it before replacing the current document. Prior document revisions remain in local session history. Changes to sources flag existing notes as potentially stale.
7. Export **portable HTML** and a **source manifest**, or download the **evidence ZIP**. Extract the ZIP before opening `index.html` so its relative audio file is available. Standalone HTML embeds images and transcript, clearly excludes audio, and contains no misleading playback buttons. Native browser Find searches the export.

Record and upload only where permitted. Cloud processing sends audio windows and derived display images to OpenAI. Recording, local import, review, and export do not require a provider call. **Create my notebook** starts paid OpenAI processing using the server-side key.

## Record from this device

1. In a new session, select **Start recording** and allow microphone access. The elapsed timer and input-level meter show capture activity.
2. Use **Pause recording**, **Resume recording**, and **Stop recording**. Keep the tab visible. Switching apps or hiding the tab pauses capture; return and explicitly resume. Screen-lock/background recording is not supported.
3. Preview or **Download audio**, then **Save to session**. Add photos and select **Create my notebook**. Captured audio goes through the same normalization, transcription, alignment, notes, and export pipeline as imported audio.

The browser saves ordered audio chunks to IndexedDB approximately every second. If the page reloads, reopen the same session on the same browser and origin to recover saved chunks. The final unsaved portion can be lost; recovery is not a guarantee against device shutdown or browser eviction. If saving to the server fails, the local draft stays available for manual retry or download. There is no automatic background upload queue. Clearing site data deletes unsaved browser recordings. If storage fills, capture stops and the tab offers a download of the available audio; keep that tab open until you save it.

Wall-clock intervals and elapsed media time are measured independently of chunk delivery. Pauses remain gaps for photo alignment. If recovered audio is interrupted or its decoded duration does not reconcile with the measured intervals, automatic clock alignment is withheld and a visible warning requests review. Recording ends at roughly two hours or 240 MB. The browser retains audio in memory as well as local storage; full-length memory/storage behavior still needs real-device testing.

**Tested scope:** automated Google Chrome on macOS with a synthetic microphone, including pause/resume, interrupted reload, offline/retried saving, permission denial, simulated microphone loss, and simulated storage exhaustion. This is not physical-microphone or mobile reliability validation. The UI works at phone widths, but Safari/iPhone/Android capture, camera switching, and full-length sessions remain untested. Capture needs a supported browser at HTTPS or localhost; the current loopback-only development server cannot be opened from another phone. Use your computer's microphone for the local workflow.

## Supported inputs and limits

| Input | Current behavior |
| --- | --- |
| Audio | MP3, M4A, WAV, MP4, WebM, OGG, FLAC, MPEG, MPGA; one file/session, up to 250 MB and 120 minutes; verified by ffprobe and converted to mono 16 kHz MP3 for playback/processing. Original retained. |
| Photos | JPEG and PNG; up to 30/session, 20 MB/photo, 60 megapixels; imported sequentially, so successful files survive a later file's error. Exact duplicates are detected by SHA-256. |
| HEIC/HEIF | Not decoded in this release. In macOS Photos use **File → Export → Export Photos → JPEG**, preserving metadata when possible. If conversion loses capture metadata, use manual/content matching. Changing an extension is not conversion. |
| EXIF | Original capture timestamp and timezone offset retained separately from user corrections. Missing offsets require a visible assumption. Display images are auto-oriented, resized to at most 1800 × 1800, and re-encoded without EXIF/GPS/XMP. |
| Notes | 280,000 characters of structured evidence and 14,000 output tokens per generation. Oversized/refused/truncated results fail visibly without discarding evidence. |

No silent HEIC fallback, invented capture times, calibrated-confidence claims, or automatic speaker identities. A source ID resolving is necessary but does not prove that the claim is supported; inspect the original evidence.

## OpenAI models and test spending

- `TRANSCRIPTION_MODEL=gpt-transcribe` is the documented current file-transcription model. Its documented JSON response has text without segment timing, so TalkWeave transcribes independently measured **30-second source windows** and labels that precision honestly. Boundaries can cut words; this is not word-level forced alignment or diarization.
- Optional `TRANSCRIPTION_MODEL=whisper-1` requests `verbose_json` segment timestamps. Official documentation marks this model deprecated with shutdown on **February 26, 2027**. It is a compatibility option, not a long-term migration strategy.
- `NOTES_MODEL=gpt-4.1-mini-2025-04-14` handles image observations and structured notes, with validated schemas and evidence IDs. It is a cost-conscious baseline; representative technical-talk quality has not yet been established.
- `TEST_BUDGET_USD=50` is capped at $50 locally. Before each request, a durable ledger reserves a deliberately conservative allowance: **$0.10 per audio window, $0.25 per image, $1 per notes draft**. Reservations include failed/cancelled requests and are not automatically refunded. No SDK automatic retries. The ledger is **not billed usage or a guaranteed provider spending limit**; check the OpenAI project usage separately. Do not delete/reset it without reconciling actual spend. The intended full 120-minute/30-photo first pass reserves $32.50.
- Responses requests set `store:false`; that is not a promise of zero provider retention. No tools are exposed to the model. Source content is treated as untrusted, and generated HTML is never executed.

Official API references: [file transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [current transcription workflow and legacy deprecations](https://developers.openai.com/api/docs/guides/transcription), [GPT-4.1 mini capabilities](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Fixtures and verification

The **Explore the demo notebook** button creates explicitly labeled authored data: a 90-second silent WAV, two synthetic slides, a prepared transcript, and notes. The first photo deliberately starts at 60 seconds; correct it to **30–60 seconds**, reload, and confirm persistence. This fixture makes **no API calls** and is **not evidence of successful transcription**.

```sh
npm test             # timeline, evidence, export safety, metadata, retries/cancellation
npm run build        # TypeScript + production frontend
npm run test:e2e     # headless installed Google Chrome; isolated localhost:3100
npm run test:offline # after e2e exits: file:// export and bundle, backend stopped
```

Browser tests use `.test-data/browser`, explicitly skip `.env`, and disable the API key. They never make paid OpenAI calls. Install Google Chrome for these tests. Unit pipeline tests inject labeled provider doubles; they do not count as live integrations.

To prepare a repeatable synthetic speech test (macOS `say`, or Linux `espeak`, plus ffmpeg):

```sh
npm run fixture
# With the app running and the intended key in .env:
npm run test:live -- fixtures/generated/synthetic-talk.m4a fixtures/generated/slide-1.jpg fixtures/generated/slide-2.jpg
```

To test a permitted real talk, pass your actual audio and at least two photos instead. `test:live` uses the app API, saves the session and exports under `fixtures/generated/live-result`, and never prints keys. Set `TALKWEAVE_RESUME_SESSION=<saved-session-id>` to resume instead of reimporting. A synthetic speech pass validates the API pipeline but does not satisfy the real in-person-talk quality gate.

See [architecture and risk decisions](docs/ARCHITECTURE.md) and [milestone verification / limitations](docs/PROGRESS.md).

## Privacy and deployment boundary

Localhost host/origin checks and a per-process mutation token block ordinary cross-origin browser writes and DNS rebinding. Media is served only from the session's enumerated assets, including byte-range audio playback. There is **no multi-user authentication or authorization**. Other software/users with access to this computer can access local data; do not expose this server through a tunnel, public bind, or hosted reverse proxy.

Deleting a session cancels processing, waits for pending work to stop, removes its managed assets and revisions, and attempts to remove its recording draft in the current browser. Drafts in other browsers/origins are separate site data. It cannot remove previously downloaded exports or control provider/back-up retention. Exported display images have no GPS metadata; originals are deliberately excluded from both export modes. ZIP generation is buffered in memory and should be done one session at a time.

## Next milestone

First close the M1 real-talk evaluation gate with a consented recording and ordinary phone photos. Basic microphone capture, pause/resume, saved-chunk recovery, and explicit interruption handling are now implemented. Complete M2 with full-length real desktop/iPhone device testing, recording highlights, and an automatic offline upload queue. Do not advertise iPhone background recording until it has passed full-length, screen-lock, and camera-switching tests.
