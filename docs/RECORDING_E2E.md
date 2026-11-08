# Recording attachment diagnosis and end-to-end check

Verified November 8, 2026, against the actual local app at `http://127.0.0.1:3000`.

## What failed

The running server predated device recording support, while Vite served the updated recorder UI. A new process could not replace it because port 3000 was occupied. The old startup path nevertheless printed a ready message and tried to open a separate HMR WebSocket port, producing the reported port 3001 conflict.

A 52.380-second recording (about 0.77 MB) reproduced HTTP 400 on **Save to session**. The displayed message said the upload exceeded the file/count limit. The actual rejection was the old multipart handler's zero-field limit: the new recorder sends capture metadata alongside audio. The recording remained in IndexedDB and was downloadable.

Earlier browser tests started a fresh backend on port 3100. They verified recording behavior but missed this mixed-version, already-running-server failure.

## Corrections

- The server exposes recording compatibility; the UI explains when the running backend needs a restart. Existing drafts remain downloadable.
- Saving checks the current server and refreshes its mutation token, so a retained recording can attach after a restart without first reloading the page.
- A duplicate startup exits with a clear port-in-use error instead of claiming readiness. HMR shares the loopback HTTP listener; no separate port 3001 is needed.
- Failed duplicate startups cannot rewrite another process's running-job state on disk.
- Saving exported HTML under generated-data directories no longer hot-reloads the app or closes its export dialog.
- The ready recording names its destination session. Successful attachment is explicit. Completed processing offers **Open notebook** instead of another generation action.

## Path for an existing recording

1. Open the **same browser profile and exact address** used for capture. `localhost:3000` and `127.0.0.1:3000` have separate browser recording storage, even though they reach the same server.
2. In **My library**, open the session where you recorded. Look for **Your recording is ready.**
3. Select **Download audio** for a backup if desired, then **Save to session**. Successful attachment shows **Attached to this session** and the source audio player.
4. In **Import**, add photos and select **Create my notebook**. If processing fails, use **Resume processing**; saved stages are reused.
5. Select **Open notebook** when complete. Review **Notes**, **Transcript**, and **Photos & alignment**; correct uncertain photo intervals and verify source playback.
6. Choose **Export → Portable HTML** for self-contained notes, or **Evidence bundle** for notes plus audio. Extract the ZIP before opening `index.html`.

A recording is created inside a session; saving attaches it to that session. To put a downloaded recording in a different session, create/open a session with no audio, then use **Import → Choose an audio recording**. Current sessions support one recording, without replacing existing evidence.

For a new recording: **New session → enter a title → Create session → Start recording → Allow microphone → Stop recording → Save to session**, then continue at step 4. Keep the recording tab visible.

If the app is stopped, run `npm run dev` in a regular terminal from the repository and keep that terminal open. Run one copy. If a previous copy is running, stop it with Ctrl+C in its terminal before restarting; a new invocation does not update the old process. Refresh after restarting if you are beginning a new capture. A ready draft can retry **Save to session** directly.

## Actual end-to-end verification

| Step | Observed result |
| --- | --- |
| Create session and record through UI | Chrome MediaRecorder captured synthetic speech from a virtual microphone; timer/input activity, local chunks, stop and preview worked. |
| Save against the old server | Reproduced the misleading HTTP 400 limit error with a small recording. Browser draft and backup download survived. |
| Restart and recover the same draft | Reopened the same browser profile/session. The same captured audio attached, decoded to 52.380 seconds, played, and retained its capture interval. |
| Photos and alignment | Imported two authored JPEG slides. Changed a deliberately wrong 40–50 second match to 8–28 seconds; correction persisted after reload and processing. |
| Real OpenAI processing | Two timestamped transcription windows, two image analyses, four note sections and seven source-linked claims. No mock provider was used for this run. |
| Content inspection | Notes retained queue decoupling, duplicate delivery/idempotency, the absence of throughput measurements, retry backoff/dead-letter handling, operational/eventual-consistency tradeoffs, rejection of exactly-once delivery, and unreadable-label uncertainty. Some points repeat across sections. |
| Review | Search for idempotency and source-chip playback worked. Transcript and notes rendered in the app; no page exception was observed in the review steps. |
| Exports | Downloaded standalone HTML, source manifest and evidence ZIP via the UI. A reload triggered by writing generated HTML exposed the watcher issue above; the subsequent regression test downloads all three without losing the dialog. |
| Fully offline | Stopped the real port-3000 backend, opened exported files in Chrome with network disabled: images and all fragment links resolved; extracted ZIP audio played via `file://`. Restarted the corrected app afterward. |
| Regression suite | 10 unit/startup tests and 10 browser tests passed, including outdated-server retry, duplicate-startup preservation, lost-response idempotency, offline save, chunk recovery, permissions, simulated microphone/storage loss, mobile UI, and three consecutive exports. Production build passed. |

The actual local notebook is **Recording E2E diagnosis — synthetic speech**, session `d2b9c06f-ff69-443f-acc6-715c5eabc431`. It remains available in the library for review.

Local-only artifacts are in `.test-data/recording-diagnosis/`: `recorded-speech.webm`, `notes.html`, `manifest.json`, `evidence.zip`, extracted `evidence/index.html`, `verification.json`, and before/after screenshots. These artifacts and all credentials are ignored by Git. They are not bundled into the PR.

This run added **$1.70 in conservative local reservations**, for **$5.50 total against the $50 test allowance**. These are not provider invoice totals.

The test used actual browser recording and live OpenAI with synthetic speech and authored images. It did not use a physical microphone or the user's original browser recording. Browser access to the user's active tab was unavailable, so that draft's contents/persistence were not inspected. Physical-device audio quality, full-length reliability, iPhone/Safari/Android capture, screen lock, and camera switching remain unverified. Next: validate a permitted real talk and the foreground capture path on actual target devices.
