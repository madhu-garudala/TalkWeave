// Acceptance exercise for our generated synthetic speech only; never edits a real talk.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const id = process.argv[2];
if (!id) throw new Error("Pass the synthetic live-test session ID.");
const base = "http://127.0.0.1:3000";
const config = await (await fetch(base + "/api/config")).json();
async function api(route: string, method = "GET", body?: unknown) {
  const r = await fetch(base + "/api/sessions/" + id + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-TalkWeave-Token": config.token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error);
  return value;
}
let s = await api("");
assert.equal(s.audio.name, "synthetic-talk.m4a");
assert.ok(s.transcript[0].rawText.toLowerCase().includes("synthetic"));
if (s.candidateNotes) s = await api("/candidate", "POST", { accept: true });
assert.ok(s.notes.sections.length >= 2);
const p = s.photos[0];
await api("/photos/" + p.id, "PATCH", { start: 30, end: s.audio.duration });
await api("/photos/" + p.id, "PATCH", { start: 0, end: 30 });
s = await api("");
assert.equal(s.photos[0].alignment.start, 0);
assert.equal(s.photos[0].alignment.end, 30);
assert.equal(s.photos[0].alignment.manual, true);
const folder = path.resolve("fixtures/generated/live-result");
fs.mkdirSync(folder, { recursive: true });
for (const [route, file] of [
  ["export.html", "notes.html"],
  ["manifest.json", "manifest.json"],
  ["bundle.zip", "evidence.zip"],
]) {
  const response = await fetch(`${base}/api/sessions/${id}/${route}`);
  assert.ok(response.ok);
  fs.writeFileSync(
    path.join(folder, file),
    Buffer.from(await response.arrayBuffer()),
  );
}
const report = {
  input: "synthetic speech, not a real talk",
  sessionId: id,
  duration: s.audio.duration,
  transcriptWindows: s.transcript.length,
  photos: s.photos.length,
  sections: s.notes.sections.length,
  claims: s.notes.sections.flatMap((v: { claims: unknown[] }) => v.claims)
    .length,
  manualMatchPersists: true,
  notesStaleAfterTimingExercise: s.notes.inputRevision !== s.evidenceRevision,
  localReservedAllowance: (await (await fetch(base + "/api/config")).json())
    .budget.reserved,
};
fs.writeFileSync(
  path.join(folder, "verification.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
