import path from "node:path";
import fs from "node:fs";
import { dir, save, sessions } from "./store.js";
import { convertAudio } from "./media.js";
import {
  transcribe,
  analyzePhoto,
  generateNotes,
  safeError,
} from "./provider.js";
import { realign, validateNotes, validateCoverage } from "./domain.js";
import type { Session } from "../shared/types.js";
export const jobs = new Map<
  string,
  { controller: AbortController; promise: Promise<void> }
>();
export type PipelineProvider = {
  transcribe: typeof transcribe;
  analyzePhoto: typeof analyzePhoto;
  generateNotes: typeof generateNotes;
};
const openaiProvider: PipelineProvider = {
  transcribe,
  analyzePhoto,
  generateNotes,
};
export function startJob(
  s: Session,
  stage: "transcribe" | "photos" | "notes" | "all",
  provider: PipelineProvider = openaiProvider,
) {
  if (jobs.has(s.id)) throw new Error("This session is already processing.");
  if (s.mode === "fixture")
    throw new Error(
      "This is a demo fixture. Create a real session for OpenAI processing.",
    );
  if (!s.audio) throw new Error("Import audio first.");
  if (provider === openaiProvider && !process.env.OPENAI_API_KEY)
    throw new Error(
      "Missing OPENAI_API_KEY. Add it to .env and restart the server.",
    );
  if (stage === "notes" && !s.transcriptionComplete)
    throw new Error("Complete transcription before generating notes.");
  if (stage === "notes" && s.photos.some((p) => !p.analysis))
    throw new Error("Analyze all photos before generating notes.");
  const controller = new AbortController();
  s.job = { status: "running", stage, progress: "Starting…" };
  save(s);
  const alive = () => {
    controller.signal.throwIfAborted();
    if (!sessions.has(s.id)) throw new Error("Session deleted.");
  };
  const update = (stage: string, progress: string) => {
    alive();
    s.job = { status: "running", stage, progress };
    save(s);
  };
  const promise = (async () => {
    try {
      if (stage === "all" || stage === "transcribe") {
        const total = Math.ceil(s.audio!.duration / 30);
        for (let i = 0; i < total; i++) {
          alive();
          if (s.completedChunks.includes(i)) continue;
          update(
            "transcribe",
            `Transcribing window ${i + 1} of ${total}. Completed windows are saved.`,
          );
          const file = path.join(dir(s.id), `chunk-${i}.mp3`);
          try {
            await convertAudio(
              path.join(dir(s.id), s.audio!.playback),
              file,
              controller.signal,
              i * 30,
              Math.min(30, s.audio!.duration - i * 30),
            );
            alive();
            const result = await provider.transcribe(
              file,
              i,
              i * 30,
              Math.min(s.audio!.duration, (i + 1) * 30),
              controller.signal,
            );
            alive();
            s.transcript.push(...result);
            s.completedChunks.push(i);
            s.evidenceRevision++;
            save(s);
          } finally {
            if (fs.existsSync(file)) fs.unlinkSync(file);
          }
        }
        alive();
        s.transcriptionComplete = true;
        realign(s);
        save(s);
      }
      if (stage === "all" || stage === "photos") {
        for (let i = 0; i < s.photos.length; i++) {
          alive();
          const p = s.photos[i];
          if (p.analysis) continue;
          update("photos", `Reading photo ${i + 1} of ${s.photos.length}.`);
          const analysis = await provider.analyzePhoto(
            s,
            p.id,
            controller.signal,
          );
          alive();
          p.analysis = analysis;
          s.evidenceRevision++;
          realign(s);
          save(s);
        }
      }
      if (stage === "all" || stage === "notes") {
        if (!s.transcriptionComplete)
          throw new Error("Complete transcription before notes.");
        update("notes", "Writing detailed notes with traceable evidence…");
        const notes = await provider.generateNotes(s, controller.signal);
        alive();
        validateNotes(s, notes);
        validateCoverage(s, notes);
        if (s.notes) s.candidateNotes = notes;
        else s.notes = notes;
        save(s);
      }
      alive();
      s.job = {
        status: "completed",
        stage,
        progress: s.candidateNotes
          ? "New draft ready to compare. Your existing notes are preserved."
          : "Ready to review. Check uncertain matches and verify source support.",
      };
      save(s);
    } catch (e) {
      if (sessions.has(s.id)) {
        s.job = {
          status: controller.signal.aborted ? "cancelled" : "error",
          stage: s.job.stage,
          progress: "Completed work is saved. Resume when ready.",
          error: safeError(e),
        };
        save(s);
      }
    } finally {
      jobs.delete(s.id);
    }
  })();
  jobs.set(s.id, { controller, promise });
}
export async function cancelJob(id: string) {
  const job = jobs.get(id);
  if (job) {
    job.controller.abort();
    await job.promise;
  }
}
