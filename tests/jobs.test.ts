import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "../server/fixture.js";
import {
  startJob,
  jobs,
  cancelJob,
  type PipelineProvider,
} from "../server/jobs.js";
import { dir, removeSession, sessions } from "../server/store.js";
import type { Session } from "../shared/types.js";
const created: Session[] = [];
after(() =>
  created.forEach((s) => {
    if (sessions.has(s.id)) removeSession(s);
  }),
);
async function input() {
  const s = await fixture();
  created.push(s);
  s.mode = "live";
  const expected = structuredClone(s.notes!);
  s.transcript = [];
  s.completedChunks = [];
  s.transcriptionComplete = false;
  delete s.notes;
  s.photos.forEach((p) => delete p.analysis);
  s.audio!.duration = 61;
  return { s, expected };
}
const wait = (id: string) => jobs.get(id)?.promise;
test("failed stage checkpoints audio, resumes without duplicates, preserves alignment and edits in candidate drafts", async () => {
  const { s, expected } = await input();
  let calls = 0;
  let fail = true;
  const provider: PipelineProvider = {
    async transcribe(_file, chunk, start, end) {
      calls++;
      if (chunk === 1 && fail)
        throw new Error("Simulated network failure (test double)");
      return [
        {
          id: `t-${chunk}-0`,
          start,
          end,
          text: "Test evidence",
          rawText: "Test evidence",
          edited: false,
          timing: "window",
          revisions: [],
        },
      ];
    },
    async analyzePhoto() {
      return {
        text: "Test slide",
        description: "Test diagram",
        uncertainties: ["Test unreadable label"],
      };
    },
    async generateNotes() {
      return {
        ...structuredClone(expected),
        inputRevision: s.evidenceRevision,
      };
    },
  };
  startJob(s, "all", provider);
  await wait(s.id);
  assert.equal(s.job.status, "error");
  assert.deepEqual(s.completedChunks, [0]);
  assert.equal(s.transcript.length, 1);
  s.transcript[0].text = "Attendee correction";
  s.transcript[0].edited = true;
  s.photos[0].alignment = {
    start: 30,
    end: 60,
    status: "matched",
    reason: "Manual correction",
    manual: true,
  };
  fail = false;
  startJob(s, "all", provider);
  await wait(s.id);
  assert.equal(s.job.status, "completed");
  assert.equal(calls, 4);
  assert.equal(s.transcript.length, 3);
  assert.equal(s.transcript[0].text, "Attendee correction");
  assert.equal(s.photos[0].alignment.start, 30);
  assert.equal(s.photos[0].alignment.manual, true);
  s.notes!.sections[0].userNote = "Keep this edit";
  startJob(s, "notes", provider);
  await wait(s.id);
  assert.equal(s.notes!.sections[0].userNote, "Keep this edit");
  assert.ok(s.candidateNotes);
  assert.equal(s.candidateNotes.sections[0].userNote, "");
  const stored = JSON.parse(
    fs.readFileSync(path.join(dir(s.id), "session.json"), "utf8"),
  );
  assert.equal(stored.notes.sections[0].userNote, "Keep this edit");
});
test("cancellation ignores a late provider result and deletion cannot be undone by a worker", async () => {
  const { s, expected } = await input();
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  let release!: () => void;
  const late = new Promise<void>((r) => (release = r));
  const provider: PipelineProvider = {
    async transcribe() {
      entered();
      await late;
      return [
        {
          id: "late",
          start: 0,
          end: 30,
          text: "Late response",
          rawText: "Late response",
          edited: false,
          timing: "window",
          revisions: [],
        },
      ];
    },
    async analyzePhoto() {
      throw new Error("Should not run");
    },
    async generateNotes() {
      return expected;
    },
  };
  startJob(s, "all", provider);
  await started;
  const cancellation = cancelJob(s.id);
  release();
  await cancellation;
  assert.equal(s.job.status, "cancelled");
  assert.equal(s.transcript.length, 0);
  assert.equal(jobs.has(s.id), false);
  const folder = dir(s.id);
  removeSession(s);
  assert.equal(fs.existsSync(folder), false);
  assert.equal(sessions.has(s.id), false);
});
