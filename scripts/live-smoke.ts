// Uses the running local app's server-side key. Never reads or prints credentials.
import fs from "node:fs";
import path from "node:path";
const base = process.env.TALKWEAVE_URL || "http://127.0.0.1:3000";
const [audio, ...photos] = process.argv.slice(2);
if (!audio || photos.length < 2)
  throw new Error(
    "Usage: npm run test:live -- /path/to/audio.m4a /path/to/photo1.jpg /path/to/photo2.jpg (authorized/consented input only)",
  );
const config = await (await fetch(base + "/api/config")).json();
if (!config.configured) {
  console.error(
    "OPENAI_API_KEY is not configured on the running server. No provider calls made. Add it to .env and restart.",
  );
  process.exit(2);
}
async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(base + "/api" + url, {
    method,
    headers: {
      "X-TalkWeave-Token": config.token,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error);
  return value;
}
let s = process.env.TALKWEAVE_RESUME_SESSION
  ? await call(`/sessions/${process.env.TALKWEAVE_RESUME_SESSION}`, "GET")
  : await call("/sessions", "POST", {
      title: audio.includes("synthetic")
        ? "Synthetic speech — live OpenAI smoke test"
        : "Live pipeline smoke test — verify input provenance",
    });
if (!process.env.TALKWEAVE_RESUME_SESSION)
  for (const [file, field, endpoint] of [
    [audio, "audio", "audio"],
    ...photos.map((file) => [file, "photo", "photos"]),
  ]) {
    const data = new FormData();
    data.append(field, new Blob([fs.readFileSync(file)]), path.basename(file));
    s = await call(`/sessions/${s.id}/${endpoint}`, "POST", data);
  }
s = await call(`/sessions/${s.id}/process`, "POST", { stage: "all" });
let previous = "";
const deadline = Date.now() + 30 * 60 * 1000;
while (s.job.status === "running" && Date.now() < deadline) {
  if (s.job.progress !== previous) {
    console.log(s.job.progress);
    previous = s.job.progress;
  }
  await new Promise((r) => setTimeout(r, 2000));
  s = await call(`/sessions/${s.id}`, "GET");
}
if (s.job.status !== "completed")
  throw new Error(
    s.job.error || "Smoke test timed out; inspect the saved session.",
  );
const folder = path.resolve("fixtures/generated/live-result");
fs.mkdirSync(folder, { recursive: true });
if (s.candidateNotes) {
  fs.writeFileSync(
    path.join(folder, "candidate.json"),
    JSON.stringify(s.candidateNotes, null, 2),
  );
  console.log(
    `Live pipeline completed for session ${s.id}. A new candidate draft awaits review in the app; current exports have not been replaced. Candidate saved locally. No credential values logged.`,
  );
  process.exit(0);
}
for (const [route, file] of [
  ["export.html", "notes.html"],
  ["manifest.json", "manifest.json"],
  ["bundle.zip", "evidence.zip"],
]) {
  const response = await fetch(`${base}/api/sessions/${s.id}/${route}`);
  if (!response.ok) throw new Error("Export validation failed");
  fs.writeFileSync(
    path.join(folder, file),
    Buffer.from(await response.arrayBuffer()),
  );
}
console.log(
  `Live OpenAI pipeline completed for session ${s.id}; exported to fixtures/generated/live-result. This proves transport and structure only. Audit factual support and record whether the input was real or synthetic. No credential values logged.`,
);
