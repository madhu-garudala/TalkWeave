# Milestone handoff — November 8, 2026

## Status

**M0 implemented. M1 import-to-HTML workflow implemented and exercised against live OpenAI using synthetic speech.** The strict real-recording acceptance gate is still open: no consented in-person talk recording or original phone-photo set was supplied. Synthetic fixtures and mock providers are explicitly distinguished from real integrations. The library/notebook UI has been redesigned and basic device recording now feeds the existing workflow. M2 is only partially implemented; its full-length real-device acceptance gate remains open. No merge or deployment is part of this work.

## What works

- Runnable loopback React/Express application with a redesigned searchable/filterable library, notebook cards, dark/light themes, responsive import/review layouts, a source-evidence rail, and native audio controls.
- Direct device microphone capture with input meter, elapsed time, pause/resume/stop, preview/download, IndexedDB chunk persistence, reload recovery, offline/manual save retry, and idempotent server saves. Permission, microphone loss, and storage failures are visible. Hidden tabs pause capture; untrusted recovery timing is withheld from clock alignment.
- Session creation, optional speaker/event metadata, audio import with actual duration validation, multiple JPEG/PNG photos, original-file preservation, and actionable HEIC conversion instructions.
- Current OpenAI file transcription in measured source windows, editable transcript terms and inaudible markers, raw model text and correction history.
- EXIF capture-time/offset extraction, explicit unknown anchors, device-clock adjustment, paused recording interval maps, content-overlap suggestions, unmatched/review states, manual bounds, and persisted overrides.
- Photo text/diagram observations with uncertainty; detailed structured notes separating speech, exact quotes, slide observations, and attendee notes. Generation excludes unsolicited background explanations. Every generated source ID is constrained to its session; whole-document coverage checks catch omitted transcript windows/photos. Human review is still necessary for semantic support.
- Search, source-interval playback, note editing, reviewable replacement drafts, preserved note histories, stale-evidence flags, progress, resumable stages, cancellation, and local deletion.
- Self-contained HTML with embedded stripped-metadata images, topic navigation, searchable transcript, inert hostile text, readable phone/desktop layout, print styles; source manifest and optional extracted ZIP audio playback.

## Actual verification

| Check | Result / scope |
| --- | --- |
| Production build | TypeScript check and Vite production build pass. |
| Focused regression tests | Nine tests: clock offset/pause mapping; unknown metadata; interval validation; source/quote validation; inert export and reference resolution; image metadata stripping; request-schema citations; failure/resume and edit preservation; cancellation/deletion liveness. Provider doubles are explicitly injected in pipeline tests. |
| Browser workflow | Headless installed Chrome on macOS: create demo; deliberately wrong photo match corrected to 30–60s; reload persistence; transcript correction with hostile HTML; note edits; search; source playback; dark/light desktop and 390px mobile layouts; HTML/ZIP download; library filtering/search and mobile session creation; missing key; audio/photo import; HEIC error; origin/mutation-token protection; deletion. |
| Device recording | Automated Chrome with a synthetic microphone: capture/playback; pause gaps; offline save failure; lost server response and idempotent retry; saved-chunk reload and decode; permission denial; simulated track loss; simulated IndexedDB quota exhaustion with in-tab download; late permission grant after cancellation. No physical microphone, Safari, iPhone, Android, or full-length capture test. |
| Offline export | Chrome `file://`, backend stopped, network offline: text and embedded images render, every fragment link resolves, no HTTP requests; extracted evidence-bundle audio loads and plays. Standalone HTML has no audio player. |
| Live OpenAI transport | A 49.963-second synthetic M4A and two authored slide JPEGs ran through real `gpt-transcribe` and `gpt-4.1-mini-2025-04-14` requests. Two timestamped windows, two image analyses, and a final five-section / sixteen-claim document. This is a live integration test with synthetic input, not a real talk trial. |
| Live retry behavior | The inherited environment credential first returned HTTP 401. After the intended repository `.env` was added, transcription and image analysis succeeded. A source-less claim was rejected before save. Citation constraints were strengthened; a later shallow draft prompted coverage checks and an explicit all-source generation prompt. Resumption reused saved audio/photo work. |
| Live content audit | Compared the final synthetic draft against the authored speech and slides: queue decoupling, at-least-once delivery, idempotency, absent throughput measurements, retry backoff/dead letter queue, operational work/eventual consistency, and the rejected exactly-once guarantee were retained. Unreadable symbols remain uncertain. The initial shallow draft's unsupported “synthetic load” explanation was not retained in the accepted draft; background generation is disabled by default. |
| Budget | No paid API requests were made for the UI/recording revision. Local conservative allowance reserved: **$3.80**, including failed requests/retries. This is not measured billing. No account billing reconciliation was performed. |
| Dependency audit | `npm audit` reports zero vulnerabilities after replacing the initial ZIP dependency and updating sharp. |
| Visible preview | In-app browser host unavailable. Automated Chrome execution and screenshot inspection were available. |

Generated inputs, live results, and test screenshots are local-only ignored artifacts. `fixtures/generated/live-result` contains the accepted synthetic notebook, manifest, ZIP, and verification report. The deliberate timing-correction exercise flags the document as potentially stale; that flag is preserved in exports instead of silently claiming regeneration.

## Remaining limitations and risks

1. **Real-talk quality is unverified.** No actual event audio, noisy room, photographed technical diagram, full-length talk, or attendee usability test was provided. No alignment-accuracy or transcription-accuracy percentages are claimed.
2. **Timestamp precision is coarse by default.** Current transcription uses measured windows of up to 30 seconds, not word timestamps. A window boundary split a sentence in the synthetic test; original audio and correction history remain available. The optional legacy segment-timing model was not live-tested and is scheduled for retirement.
3. **HEIC needs conversion.** JPEG/PNG work; original iPhone HEIC files are not decoded in this release. Missing EXIF after conversion requires a manual/content match. Real iPhone camera EXIF variants and daylight-saving edge cases need field testing.
4. **Image/text quality needs human review.** OCR in the synthetic test produced unclear arrow symbols; uncertainty is retained, and no claim of perfect diagram interpretation is made. Citation validity/coverage does not prove factual support.
5. **Local, single-process prototype.** No accounts, per-user authorization, hosted private media, multi-worker storage coordination, or public-service abuse controls. Uploads and ZIPs are buffered; export one large session at a time. Do not expose the server publicly.
6. **M2 capture is partial.** Basic foreground microphone recording and saved-chunk recovery pass synthetic Chrome tests. No full-length real-device test, physical microphone test, background/screen-lock support, phone-camera coexistence, automatic upload queue, or recording highlights yet. The last unsaved chunk may be lost. Clearing/evicting browser storage removes unsaved drafts; audio also remains in RAM during capture. Mobile viewport screenshots are not mobile capture validation. The loopback development server is not reachable from a separate phone.
7. **Review/UI limits.** One editable alignment interval per photo; images can be cited from multiple note sections. Paused imports use an advanced JSON editor. Prior notes revisions are retained in local JSON but there is no restoration UI. A short manual capture-time override for individual EXIF-less photos is represented by their audio interval rather than rewritten EXIF.
8. **Provider boundary.** Network failures are distinguished from authentication failures; no offline ASR/vision model exists. A cancelled request may already have incurred provider charges. Local reservations are not OpenAI invoice totals or an account-level hard cap.

## Next concrete work

Before claiming the real-talk M1 acceptance gate, import a permitted 30–60 minute technical talk with original phone photos, fix at least one known wrong match, audit every section's source support, and reopen both exports after stopping the backend. Include a missing-EXIF photo, a delayed photo, a repeated slide, and a clock offset.

Complete **M2 capture/recovery**: validate the implemented chunk persistence, interval mapping, pause/resume, failure handling, and manual upload retry on full-length real-device recordings; add highlights and automatic offline upload retry. Test iPhone screen-lock and camera switching explicitly before deciding whether native capture is necessary. M3 is the multi-talk quality/attendee pilot; M4 covers deployment-appropriate access and retention controls.
