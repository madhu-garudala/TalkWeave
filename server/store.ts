import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Session } from "../shared/types.js";
export const DATA = path.resolve(process.env.DATA_DIR || ".data");
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
export const sessions = new Map<string, Session>();
export function dir(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid session ID.");
  return path.join(DATA, id);
}
export function atomic(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
for (const entry of fs
  .readdirSync(DATA, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^[a-z0-9-]+$/.test(e.name))) {
  const file = path.join(DATA, entry.name, "session.json");
  if (!fs.existsSync(file)) continue;
  const s = JSON.parse(fs.readFileSync(file, "utf8")) as Session;
  if (s.job.status === "running") {
    s.job = {
      status: "error",
      stage: s.job.stage,
      progress: "Interrupted by server restart. Resume to keep completed work.",
      error: "Processing was interrupted.",
    };
    atomic(file, s);
  }
  sessions.set(s.id, s);
}
export function save(s: Session) {
  if (!sessions.has(s.id)) throw new Error("Session no longer exists.");
  s.revision++;
  atomic(path.join(dir(s.id), "session.json"), s);
}
export function createSession(
  title: string,
  mode: Session["mode"] = "live",
): Session {
  const s: Session = {
    id: randomUUID(),
    title,
    speaker: "",
    event: "",
    createdAt: new Date().toISOString(),
    revision: 0,
    evidenceRevision: 0,
    mode,
    recordingStart: null,
    photoTimezone: "",
    deviceOffset: 0,
    recordingSegments: [],
    photos: [],
    transcript: [],
    transcriptionComplete: false,
    completedChunks: [],
    noteHistory: [],
    job: {
      status: "idle",
      stage: "import",
      progress: "Import your audio and photos to begin.",
    },
  };
  fs.mkdirSync(dir(s.id), { recursive: true, mode: 0o700 });
  sessions.set(s.id, s);
  save(s);
  return s;
}
export function removeSession(s: Session) {
  fs.rmSync(dir(s.id), { recursive: true, force: true });
  sessions.delete(s.id);
}
const ledgerFile = path.join(DATA, "budget.json");
const ledger: {
  reserved: number;
  requests: { at: string; kind: string; allowance: number }[];
} = fs.existsSync(ledgerFile)
  ? JSON.parse(fs.readFileSync(ledgerFile, "utf8"))
  : { reserved: 0, requests: [] };
export function budget() {
  const n = Number(process.env.TEST_BUDGET_USD || 50);
  return {
    limit: Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 50,
    reserved: ledger.reserved,
  };
}
export function reserve(kind: string, allowance: number) {
  if (ledger.reserved + allowance > budget().limit)
    throw new Error(
      "Local test allowance exhausted. Review .data/budget.json and actual OpenAI usage before further tests.",
    );
  ledger.reserved += allowance;
  ledger.requests.push({ at: new Date().toISOString(), kind, allowance });
  atomic(ledgerFile, ledger);
}
