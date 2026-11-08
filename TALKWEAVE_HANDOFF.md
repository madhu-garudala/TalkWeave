# TalkWeave — product and implementation handoff

Prepared November 6, 2026. Status: proposed plan; implementation has not started.

## Read this first

Build TalkWeave for people physically attending technical talks, meetups, lectures, and workshops. They want to listen instead of typing, photograph useful slides and diagrams, and leave with notes they can actually use.

The intended experience is: start recording on an existing device, take photos naturally, stop, review automatically matched photos and explanations, and export a detailed illustrated HTML reference. No special recording hardware or online meeting integration is required.

The distinguishing product hypothesis is that ordinary camera photos, contextual alignment, evidence-backed explanations, and portable output together offer a better experience than existing tools. Audio plus images is not itself new. Validate the hypothesis rather than claiming an uncontested market.

Start with a complete import-to-document workflow. Prove the output is valuable before investing in live capture reliability. The eventual MVP includes live capture on explicitly tested platforms; the first milestone does not.

The requirements below define outcomes and constraints. Frameworks, component organization, database schema, and implementation details remain the implementing agent's decisions. Suggested defaults are recommendations, not previously approved user requirements.

## Why and for whom

Primary user: an attendee at an in-person technical event, recording where permitted, with a phone and possibly a laptop. The talk contains diagrams, unfamiliar terminology, implementation choices, demonstrations, and audience questions.

Current failure: photos lose their spoken context, recordings are time-consuming to revisit, and short summaries erase technical detail. A transcript alone does not explain what the speaker was pointing at.

Success: a week later, the attendee can quickly find a diagram, understand what the speaker said about it, inspect the original evidence, and use the information accurately.

Secondary opportunities, after validation: university lectures, training workshops, and organizer-provided event notes. Do not expand the first release to every kind of meeting.

## End-state example

A participant attends a 60-minute architecture talk and takes 15 photos with the normal iPhone Camera app. Audio is captured on a laptop or a supported phone recorder. TalkWeave imports the photos, proposes relevant audio intervals, identifies uncertain matches, and creates a document containing:

- An overview and navigable topic outline.
- Original slide and diagram photos beside explanations of their components and relationships.
- The speaker's stated decisions, alternatives, tradeoffs, constraints, examples, and caveats.
- Timestamped evidence links and a searchable transcript.
- Audience Q&A where audible, without guessing speaker identities.
- A glossary grounded in the material; any added background explanation is explicitly labeled.
- User highlights and personal notes, distinguishable from the speaker's statements.

Example section: “Why the team introduced a queue,” with the architecture image, the bottleneck the speaker described, the alternatives discussed, and the relevant audio range. If no reason was stated, say so rather than inventing one.

The output is a usable HTML document, not a screenshot of text. It remains readable without a TalkWeave account or a live backend.

## Evidence from existing products

Research is based on official product documentation reviewed November 6, 2026, not hands-on testing. Capabilities and packaging may change. Lack of documentation is not proof that a competitor lacks a feature.

| Product | Documented functionality relevant to TalkWeave | Product lesson |
| --- | --- | --- |
| Plaud | The v4 mobile workflow offers marks, typed memos, and photos during recording; memos and photos appear under related transcript segments. Highlights can be edited and optionally included in transcript exports. | Make capture lightweight and keep visual context next to speech. |
| Genio Notes | Image cards can be inserted at a point in recorded audio, with editable start/end boundaries; images support text extraction. | Let users inspect and correct the association instead of trusting automatic matching blindly. |
| Notability | Recorded audio synchronizes with annotations, including photos. Users can jump from notes to audio, adjust playback speed, import recordings, and export recordings alongside a PDF in a ZIP. | Direct evidence navigation and portable media matter. |
| LensNote | Its documented video workflow extracts key slides with timestamps, transcript context, and key messages, with structured report exports. | Organize around visual explanations, not an undifferentiated transcript. Video slide extraction is adjacent to our photo workflow. |
| Otter | Its online-meeting slide capture places screen shares alongside transcripts and supports questions about captured images. | Borrow visual navigation ideas; online-meeting integrations are outside this product's first scope. |

Genio's reviewed export documentation describes copying notes and printing to PDF, and says direct external audio download is unavailable. Portable HTML with optional source media is a concrete TalkWeave requirement, not a claim that no competitor offers portability.

Plaud's older highlight article is version-specific. A separate article describes adding images to an existing recording and refreshing its summary. Do not use the old “active recordings only” wording to claim that all versions prohibit later attachments.

Unverified competitive questions: ordinary iPhone Camera photos imported in bulk; automatic capture-time alignment across devices; handling of recording pauses; quality of technical diagram explanations; fully offline HTML export. These need hands-on comparisons.

Sources:

- [Plaud v4 highlights, memos, and photos](https://support.plaud.ai/hc/en-us/articles/63429919023385-Highlight-a-moment-while-recording-for-v4-0-x-or-later)
- [Plaud notes and images as summary context](https://support.plaud.ai/hc/en-us/articles/53693901860633-How-do-text-notes-and-images-help)
- [Genio image cards, boundaries, and OCR](https://help.genio.co/article/253-uploading-an-image)
- [Genio export and sharing](https://help.genio.co/article/40-export-or-share-notes)
- [Genio in-person recording](https://genio.co/resources/product-and-feature-guides/how-to-record-with-genio-notes)
- [Notability recording, replay, and export](https://support.gingerlabs.com/en-us/articles/16300122-recording-and-playing-audio)
- [LensNote product workflow](https://lensnote.app/)
- [Otter slide capture](https://help.otter.ai/hc/en-us/articles/5093321813911-Automated-Slide-Capture-Overview)

## Product priorities

### P0: first usable import-to-document release

1. Create a session with title and optional speaker/event metadata.
2. Import audio and multiple photos; preserve originals. Document supported formats and limits. Support common phone audio and JPEG/PNG; resolve HEIC handling early because ordinary iPhone photos are central to this workflow. Provide an actionable conversion fallback if HEIC is not yet supported.
3. Establish the recording's actual start time and timezone, or ask the user to set them. An uploaded file's modification time is not a reliable recording start time.
4. Produce a timestamped transcript with editable technical terms and explicit inaudible spans. Do not promise perfect verbatim accuracy or expose invented confidence percentages.
5. Suggest photo-to-audio intervals using capture metadata and nearby content. Support missing metadata, manual time offset, and manual interval correction.
6. Extract slide text and interpret visual content while preserving the original image. Flag unclear labels or arrows.
7. Generate detailed topic-based notes with traceable source references. Preserve uncertainty and important caveats.
8. Review the document, transcript, photos, and audio together. Search text, play relevant source intervals, correct matches, and edit notes.
9. Export portable HTML and a source manifest; optionally include audio in an archive.
10. Show processing state and recoverable errors. Retrying a stage must not create duplicate sessions or overwrite user edits.
11. Keep sessions private, support deletion, and keep credentials out of browser code, exported files, and logs.

### P0: complete capture MVP, after the import release

- Start, pause, resume, and stop microphone capture on a documented platform/browser set.
- Display recording state, elapsed time, microphone activity, and interruptions.
- Save captured data locally in recoverable chunks; queue uploads through network outages.
- Add a one-tap highlight and optional text note while recording.
- Import normal camera photos during or after the session without requiring a special camera app.
- Reuse the same transcript, alignment, review, and export pipeline.
- Test at least a full-length talk on real target devices. Do not advertise reliable iPhone background recording based only on desktop or simulator testing.

### P1: improve the experience after core validation

- In-app photo capture, once camera/microphone coexistence has been tested.
- Optional live transcript, clearly provisional until finalized.
- Better speaker separation with user-editable labels.
- Duplicate-photo grouping, crop and perspective correction that preserve originals.
- A slide gallery and cross-session search.
- Grounded questions about a session, with source references and an explicit insufficient-evidence response.
- Printable PDF, Markdown, and more export templates.
- Optional secure cross-device session pairing for phone photos and laptop audio.
- Cost preview, usage limits, and retention controls for hosted use.

### Later, only with evidence of demand

Native iPhone recording, organizer-managed sessions, consented shared audio feeds, translations, collaboration, integrations, and monetization. Native capture may move earlier if phone-only use is essential and the browser fails the reliability gate.

### Out of scope initially

Zoom/Meet/Teams bots, screen-recording integrations, dedicated hardware, always-on listening, hiding microphone indicators, automatic publication, autonomous follow-up messages, flashcards/quizzes, and a full handwritten notebook editor. Do not make “best of both” mean feature parity with every competitor.

## Photo alignment: essential behavior

The system needs to distinguish wall-clock time from audio playback position. Maintain recording segments with their actual capture intervals, media offsets, pauses, and interruptions. A simple subtraction works only for continuous recording with aligned clocks.

For each photo, preserve original metadata separately from corrected values and alignment decisions. Use capture time, not upload time. Read timezone/offset data when present. If absent or ambiguous, make the assumption visible and allow correction. Photos may have edited dates or missing metadata.

Suggested matching process, open to improvement:

1. Derive a candidate moment using capture metadata and a user-adjustable device offset.
2. Map that moment onto actual recorded segments. A photo taken during a pause has no exact audio counterpart; flag it.
3. Examine surrounding speech, allowing for the user taking the photo after the explanation began.
4. Use recognized slide text and topic overlap to propose a bounded interval. Repeated slides may legitimately link to more than one interval.
5. Show matched, needs review, or unmatched status with a brief reason. Do not present heuristic scores as calibrated probabilities.
6. Let the user move interval boundaries or select a different topic. Preserve these overrides across regeneration.

When capture times are unavailable, offer a manual anchor and content-based suggestions. Do not silently assign the nearest upload time. Show unmatched photos rather than dropping them.

Apple documents that photo dates and times can be viewed and edited: [photo information](https://support.apple.com/guide/iphone/see-photo-and-video-information-iph0edb9c18f/ios).

## Output quality and evidence

Separate these concepts in both stored data and the UI:

- Speaker statement: a paraphrase supported by transcript/audio references.
- Direct quote: exact transcript text with a source range; never a reconstructed quote.
- Slide observation: supported by an identified image or extracted text.
- User note: authored by the attendee.
- Added explanation: optional AI background, clearly labeled, never attributed to the speaker.

Each substantive generated section must reference supporting transcript segments and/or images. A reference existing is necessary but not sufficient: evaluate whether it actually supports the claim.

No invented benchmark numbers, code, URLs, architectural relationships, decisions, or recommendations. Do not infer that a diagram represents the speaker's deployed system unless supported. Mark conflicting sources. Preserve original transcript revisions so user corrections are distinguishable from raw model output.

Regeneration must preserve user-authored changes or offer an explicit reviewable replacement. Invalid references and missing media must be caught before export.

## Export contract

Default: a self-contained HTML document with embedded display images, topic navigation, searchable text, source timestamps, and no dependency on a login, CDN, or backend. A browser's built-in text search is sufficient for the first milestone.

Optional evidence bundle: a ZIP containing the document, relative-path audio/images as needed, and a machine-readable manifest. Explain that users must extract the ZIP before opening it. Test playback under local-file browser restrictions; do not depend on fetching local JSON to render the core document.

If audio is excluded, timestamps still identify transcript evidence and the document clearly says audio is not included. Do not leave buttons that falsely imply offline audio playback works.

Exported pages must render untrusted transcript/OCR/model content safely. Use a controlled template; never execute model-generated scripts or raw unsanitized HTML. Remove GPS metadata from exported display images by default while retaining capture-time information needed for alignment internally. Make inclusion of originals explicit.

The document must be readable on a phone and desktop, keyboard navigable, and printable without clipped diagrams. Images need useful descriptions. Long transcripts should be collapsible without hiding the main technical explanation.

## Reliability, privacy, and operating boundaries

- Recording is transparent, with normal OS microphone permission and indicators. Include a concise reminder to record only where permitted; do not claim that clicking it establishes legal consent.
- The product can capture locally while offline; cloud transcription and generation require connectivity unless an actual local model is implemented. Distinguish these states in the UI.
- Detect permission denial, microphone loss, processing failure, storage exhaustion, and incomplete recordings. Never show a healthy recording state when capture is known to have stopped.
- Use independently recorded timing information; chunk arrival intervals can be delayed. Do not calculate media duration solely from chunk count.
- Some recorder chunks may require prior container data for decoding. Validate actual recovery/playback rather than assuming every saved blob is independently playable.
- Use resumable, bounded processing jobs with cancellation and retry. Record stage errors without logging private content by default.
- For a local prototype, bind services locally and document where data is stored. Before any multi-user deployment, implement authentication, per-session authorization, private media access, deletion, and abuse/cost controls.
- Session deletion covers original media, derived images, transcripts, generated notes, and active jobs. Explain limits for previously downloaded copies and provider/back-up retention; do not promise remote erasure beyond actual control.
- Treat transcript and image contents as untrusted data, including text that looks like instructions to the AI. They cannot change application rules, invoke external actions, or access secrets.

Browser timing caveats are documented in [MDN's MediaRecorder dataavailable reference](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event). This warrants device testing, not a blanket claim that all mobile browsers fail.

## Implementation freedom and suggested structure

Choose a small maintainable stack after inspecting the actual repository. A responsive web UI with a server-side processing worker is a reasonable starting point. A CLI can accelerate pipeline development, but it does not replace the attendee-facing review UI.

Keep capture/import, storage, transcription, photo analysis/alignment, document generation, and export separable. Store structured evidence and document data first; render HTML from it. Avoid making an LLM generate the entire application or an arbitrary HTML artifact directly.

Useful domain concepts, not a prescribed database schema: session, recording segment, media asset, transcript segment, highlight, photo alignment, document revision, processing job, and export manifest. Give source objects stable IDs so edits and retries do not break references.

Provider choice is open. Validate actual audio transcription capabilities, timestamps, media limits, image support, latency, and costs before choosing models. A text-generation model is not automatically a speech-transcription endpoint. Use expensive inference only when measured quality justifies it; Ultrafast mode is not a product requirement.

Current environment note: the previous Ultrafast workspace contained an OPENAI_API_KEY in .env. Attempts from that agent's restricted shell failed at DNS resolution before authentication. The key and model access were not verified. Do not assume a key exists in this new repository, copy secrets into this handoff, or classify a network failure as invalid credentials. Keep any credentials server-side and ignored by version control.

## Milestones and completion evidence

### M0 — repository discovery and risk checks

Read existing repository instructions and code. Document chosen assumptions and a minimal architecture. Establish supported import formats, HEIC behavior, transcription timestamps, and an evaluation fixture. Run a short recording feasibility check on intended browsers if available; record untested devices honestly.

Done when: there is a runnable development path, a sample or consented test input, a clear provider/configuration boundary, and a documented plan for missing credentials or media. Mock data must be labeled and cannot count as a successful live integration.

### M1 — complete import-to-HTML vertical slice

Implement session creation, audio/photo import, timestamped transcription, initial alignment, editable matches, structured notes, evidence playback, and HTML export. Prioritize one functioning path over a polished empty dashboard.

Done when: a real recording and multiple photos produce a readable export; at least one deliberately incorrect photo match can be corrected; the correction persists; all generated source references resolve; the export works with the backend stopped.

### M2 — capture and recovery

Add microphone recording, local durability, pause/resume, highlights, upload recovery, and visible capture problems. Reuse M1 processing.

Done when: a recorded full-length session survives an offline interval, saved material can be recovered after interruption, and a support matrix reports real browser/device results. Uncaptured gaps must remain visible. Phone camera switching and screen lock are explicit tests; a failing configuration is not marketed as supported.

### M3 — quality evaluation and pilot

Evaluate at least three permitted talks covering clear speech, noisy audio, and technical diagrams. Include missing photo metadata, a delayed photo, repeated slides, and wrong device time. Compare outputs with accessible competitors; document unavailable trials rather than inventing results.

Proposed pilot targets, to validate rather than advertise as existing performance:

- At least 90% of evaluable photos assigned to the correct human-labeled explanation interval on the fixture set; report unmatched and ambiguous cases separately.
- Every generated factual section has resolvable evidence; manually audit support, with zero critical invented technical claims in the reviewed set.
- At least 95% of clear-audio sampled key names/numbers/acronyms are correct after the available correction workflow. Report raw performance separately.
- Five pilot attendees can answer at least four of five source-grounded questions using the document without replaying the whole talk.
- Measure whether attendees reopen their notes after a week, plus processing time, cost per audio hour, correction burden, and capture failures. Set commercial targets after collecting data.

### M4 — release preparation

Complete deployment-appropriate access controls, retention/deletion behavior, accessible UI, performance limits, and export checks. Choose native/mobile expansion or organizer features only based on pilot evidence. Publishing and paid-service setup are separate actions from writing local application code.

## Focused acceptance scenarios

| Scenario | Required behavior |
| --- | --- |
| Normal talk with original photos | Plausible alignment, complete notes, source navigation, usable export. |
| Photo captured during pause | Mark the timing gap; offer contextual/manual matching without claiming exact alignment. |
| Phone clock differs by three minutes | An adjustable offset fixes matches without changing original metadata. |
| Photo lacks EXIF | Visible uncertainty and manual/content-based matching; no fabricated capture time. |
| Recording start time unknown | Request an anchor or use manual matching; never assume file modification time. |
| Repeated slide or duplicate photo | Group duplicates optionally; retain distinct explanations and original assets. |
| Unreadable diagram label | Mark unreadable; do not fill it with a confident guess. |
| Provider fails halfway | Preserve inputs and completed stages; retry without duplicates. |
| User edits then regenerates | Preserve the edit or show a reviewable replacement. |
| Microphone denied/disconnected | Actionable state; no false active-recording indication. |
| Network drops | Captured local data remains recoverable within documented storage limits. |
| Export opened offline | Text and images work; audio works if bundled or is clearly absent. |
| Transcript contains hostile HTML/instructions | Render as inert content; do not execute it or follow embedded instructions. |
| Session deleted | Remove managed assets and prevent an in-flight job from recreating them. |

## How the next agent should work

Begin with the short brief and the current milestone. Consult detailed sections when they affect implementation. Detail is valuable when it expresses user needs, invariants, and observable acceptance criteria; avoid treating tentative suggestions as rigid instructions.

Work in small end-to-end increments. Make routine reversible decisions autonomously and record consequential assumptions. Ask when a missing answer changes privacy, platform commitment, spending, or the product's intended outcome. Do not repeatedly ask permission to perform already-authorized implementation work.

Maintain a short progress record listing completed behavior, actual validation, unresolved risks, and the next milestone. Do not label plans, mocks, or screenshots as working integrations. Do not start unrelated features to avoid a difficult core requirement.

For each milestone handoff, report what a user can now do, how it was verified, what remains unsupported, and the next concrete step. Run tests appropriate to the changed behavior; timeline mapping, recovery, provenance, and safe export deserve focused tests more than cosmetic implementation details.

OpenAI's [Codex workflow guidance](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex#build-phase-files) also recommends phase context, purpose, boundaries, and acceptance criteria. The principle here is a concise entry point with discoverable detail, not a requirement to dump the whole plan into every prompt.

## Decisions to revisit with evidence

- Is phone-only capture essential for the first release, or is laptop audio plus phone photos acceptable initially? Recommended starting path: import first, then tested desktop capture; do not present this as final mobile parity.
- Can browser capture meet the real mobile workflow? If not, evaluate native capture instead of disguising limitations.
- Which speech/vision providers work best on real technical talks? Benchmark before locking in.
- What is the minimum useful note depth? Compare with attendee questions rather than word count.
- What will users pay for: individual sessions, subscriptions, or organizer sponsorship? Defer billing implementation until validated.

No GitHub repository has been connected by this document. Do not assume any remote URL, deployment target, existing application code, or successful API authentication.
