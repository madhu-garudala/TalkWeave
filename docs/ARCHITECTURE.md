# M0/M1 and foreground capture decisions

The initial checkout contained only the untracked product handoff, no application, no repository instructions (`AGENTS.md`), and no local/remote commits. The requested implementation lives on `feat/m0-m1-import-to-html`. A minimal handoff baseline is needed for GitHub to have a PR base; no implementation is merged.

## Small local architecture

- **React + TypeScript + Vite**: responsive notebook UI, dark/light themes, import, editable transcript/alignment, reviewable note drafts, native audio source playback, and export downloads.
- **MediaRecorder + IndexedDB**: foreground microphone capture, ordered chunks saved locally, independent wall/media interval measurements, pause/resume, recovered-stream playback, and manual upload retry through the import endpoint. Format selection is capability-based (WebM/Opus, MP4, Ogg); only Chrome/WebM has automated capture validation. No chunk is assumed independently decodable.
- **Express**: one loopback server for API and UI; local per-session directories, atomic JSON snapshots, original media and derived assets. This avoids introducing hosted auth/storage before proving the product.
- **FFmpeg/ffprobe**: validate actual duration, normalize phone audio, extract bounded windows. No chunk-arrival or file-modification timing assumptions.
- **sharp + exifr**: retain originals and capture metadata; auto-orient and re-encode display images without metadata. HEIC remains an explicit conversion workflow.
- **OpenAI adapter**: current file transcription + economical multimodal structured generation; all keys remain server-side. App errors distinguish missing key, authentication, quota, network, refusal/truncation, and reference failures without returning upstream payloads.
- **Controlled HTML template + fflate ZIP**: escape all source text; embed only generated JPEG display assets; no model HTML/scripts, CDNs, remote fonts, login, or local JSON fetch. Optional audio uses a relative path. HTML CSP denies scripts and external resources.

## Data and processing invariants

`Session` contains stable IDs for transcript windows, photos, and document sections. Raw transcription, correction history, original photo metadata, clock corrections, and manual alignment decisions are distinct values. Generated claims distinguish speaker statement, exact transcript quote, slide observation, and added explanation; personal notes are separate attendee-authored text.

One job per session runs bounded audio windows, then per-photo observations, then structured notes. A window/photo is checkpointed only after a successful result. Retries skip completed inputs. Manual alignments and corrected transcript text survive retries. New notes become a candidate when an existing document exists; accepting retains the previous document in history. UI edits/imports are blocked while processing so evidence snapshots cannot race with generation. Restarted jobs become recoverable errors; they do not silently restart paid requests.

Cancellation aborts HTTP and subprocess requests and checks liveness after awaits. Session deletion awaits cancellation before removing local assets. Interrupted/failed requests can still have provider charges; the conservative allowance is retained.

Capture times plus an explicit offset map onto recording intervals with separate wall-clock and media times. A photo in a gap remains unmatched, even if content overlaps. With no reliable capture time/anchor, distinctive lexical overlap of OCR with speech can propose a bounded window, always marked for review. Exact clock matches also remain suggestions until a person confirms them. There are no fabricated confidence scores.

Exports reject missing display media, invalid source IDs, source-less claims, photo-only speaker claims, and direct quotes not found verbatim in one referenced transcript segment. Semantic factual support still requires human review. Correcting a transcript may invalidate an earlier direct quote; repair or regenerate that claim before export. A stale-evidence banner accompanies notes generated against older evidence.

## Consequential limits

- Local JSON storage is designed for one server process, not multi-worker concurrency. OS/filesystem errors surface; no database transactions, resumable large uploads, or cross-device sync yet.
- Import uploads are buffered in memory. ZIP exports are buffered too. Inputs and counts are bounded, but this is a local desktop prototype, not a hardened public upload service.
- M1 assumes imported audio can be decoded. Window cuts can clip speech context; finer forced alignment/VAD chunking merits evaluation after real talk tests. Original audio remains available for correction.
- Transcript and whole-document notes revisions are retained. The revision history is available in managed JSON/manifest; a restore-browser for old note versions is deferred.
- Paused imported audio needs a user-supplied interval map. Direct capture populates this from recorder events and monotonic elapsed time. The server reconciles it with decoded duration; interrupted/unreconciled capture keeps raw metadata but no inferred clock-alignment intervals.
- Browser WebM streams can omit container duration. The import endpoint decodes the ordered stream into bounded playback audio and probes that result. A capture UUID makes save retries idempotent when the server committed but the browser lost the response. Capture metadata is preserved in the source manifest.
- Recording drafts are per browser/origin and session, not synced. IndexedDB transactions atomically pair each chunk with its metadata; recovery reconstructs the complete ordered stream. Storage failure stops capture and retains an in-tab download. The last uncommitted audio can be lost; browser eviction and full-length memory pressure remain risks.
- Photo semantic matching is a lexical heuristic, not calibrated probabilities or a slide-understanding benchmark. Repeated slides can be retained as distinct photos; duplicate bytes are flagged rather than silently added twice.
- The model prompts prohibit following source instructions and have no external tools/secrets in context. Escaping/CSP is the executable-content boundary; prompts alone are not used as HTML security.
- No deployment/auth or mobile background recording promises. Full-length device capture validation, automatic upload queues, native recording, and deployment access controls remain separate work. The UI pauses when hidden instead of claiming background continuity.
