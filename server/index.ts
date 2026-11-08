import "./config.js";
import express from "express";
import { createServer as createHttpServer } from "node:http";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { z } from "zod";
import {
  sessions,
  createSession,
  dir,
  save,
  removeSession,
  budget,
  recoverInterruptedJobs,
} from "./store.js";
import {
  convertAudio,
  duration,
  hash,
  hasFFmpeg,
  importPhoto,
} from "./media.js";
import { realign, validateSegments, validateNotes } from "./domain.js";
import { startJob, cancelJob, jobs } from "./jobs.js";
import {
  notesModel,
  transcriptionModel,
  safeError,
  claimSchema,
} from "./provider.js";
import { exportHtml, manifest } from "./export.js";
import { fixture } from "./fixture.js";
import type { Session } from "../shared/types.js";
export const app = express();
const token = randomUUID();
const port = Number(process.env.PORT || 3000);
const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
app.use((req, res, next) => {
  if (!allowedHosts.has(req.headers.host || ""))
    return res.status(403).json({ error: "Localhost access only." });
  if (
    req.headers.origin &&
    ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(
      req.headers.origin,
    )
  )
    return res
      .status(403)
      .json({ error: "Cross-origin requests are blocked." });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      const supplied = Buffer.from(req.header("X-TalkWeave-Token") || "");
      const expected = Buffer.from(token);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return res
          .status(403)
          .json({ error: "Refresh the page before changing local data." });
    }
  }
  next();
});
app.use(express.json({ limit: "2mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024, files: 1, fields: 1 },
});
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 },
});
const idSchema = z.string().uuid();
function session(id: unknown) {
  const s = sessions.get(idSchema.parse(id));
  if (!s) throw Object.assign(new Error("Session not found."), { status: 404 });
  return s;
}
function idle(s: Session) {
  if (jobs.has(s.id) || imports.has(s.id))
    throw Object.assign(
      new Error(
        "Wait for processing/import to finish or cancel processing before editing.",
      ),
      { status: 409 },
    );
}
const imports = new Set<string>();
const deleting = new Set<string>();
const date = z.string().datetime({ offset: true });
const metadata = z.object({
  title: z.string().trim().min(1).max(200),
  speaker: z.string().max(200),
  event: z.string().max(200),
  recordingStart: date.nullable(),
  photoTimezone: z.string().regex(/^(|Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/),
  deviceOffset: z.number().min(-86400).max(86400),
  recordingSegments: z
    .array(
      z.object({
        wallStart: date,
        wallEnd: date,
        mediaStart: z.number().nonnegative(),
        mediaEnd: z.number().positive(),
      }),
    )
    .max(200)
    .optional(),
});
const captureSchema = z.object({
  id: z.string().uuid(),
  startedAt: date,
  intervals: z
    .array(
      z.object({
        wallStart: date,
        wallEnd: date,
        mediaStart: z.number().nonnegative(),
        mediaEnd: z.number().nonnegative(),
      }),
    )
    .max(1000),
  interrupted: z.boolean(),
  warnings: z.array(z.string().max(1000)).max(100),
});
app.get("/api/config", async (_req, res) =>
  res.json({
    token,
    configured: !!process.env.OPENAI_API_KEY,
    captureVersion: 1,
    transcriptionModel: transcriptionModel(),
    notesModel: notesModel(),
    budget: budget(),
    ffmpeg: await hasFFmpeg(),
  }),
);
app.get("/api/sessions", (_req, res) =>
  res.json(
    [...sessions.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => ({
        id: s.id,
        title: s.title,
        speaker: s.speaker,
        event: s.event,
        createdAt: s.createdAt,
        mode: s.mode,
        photoCount: s.photos.length,
        duration: s.audio?.duration,
        status: s.job.status,
      })),
  ),
);
app.post("/api/sessions", (req, res) => {
  const { title } = z
    .object({ title: z.string().trim().min(1).max(200) })
    .parse(req.body);
  res.status(201).json(createSession(title));
});
app.post("/api/fixture", async (_req, res) =>
  res.status(201).json(await fixture()),
);
app.get("/api/sessions/:id", (req, res) => res.json(session(req.params.id)));
app.patch("/api/sessions/:id", (req, res) => {
  const s = session(req.params.id);
  idle(s);
  const patch = metadata.parse(req.body);
  const segments =
    patch.recordingSegments ??
    (patch.recordingStart && s.audio
      ? [
          {
            wallStart: patch.recordingStart,
            wallEnd: new Date(
              Date.parse(patch.recordingStart) + s.audio.duration * 1000,
            ).toISOString(),
            mediaStart: 0,
            mediaEnd: s.audio.duration,
          },
        ]
      : []);
  validateSegments(segments, s.audio?.duration || 0);
  Object.assign(s, patch, { recordingSegments: segments });
  s.evidenceRevision++;
  realign(s);
  save(s);
  res.json(s);
});
app.post(
  "/api/sessions/:id/audio",
  upload.single("audio"),
  async (req, res) => {
    const s = session(req.params.id);
    idle(s);
    const capture = req.body?.capture
      ? captureSchema.parse(JSON.parse(req.body.capture))
      : undefined;
    if (s.audio && capture && s.capture?.id === capture.id) return res.json(s);
    if (s.audio)
      throw new Error(
        "Audio is already imported. Create a new session for a different recording.",
      );
    if (!req.file) throw new Error("Choose an audio file.");
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (
      ![
        ".mp3",
        ".m4a",
        ".wav",
        ".mp4",
        ".webm",
        ".ogg",
        ".flac",
        ".mpeg",
        ".mpga",
      ].includes(ext)
    )
      throw new Error(
        "Use MP3, M4A, WAV, MP4, WebM, OGG, FLAC, MPEG, or MPGA audio.",
      );
    imports.add(s.id);
    const original = "audio-original" + ext;
    const file = path.join(dir(s.id), original);
    const playback = path.join(dir(s.id), "audio.mp3");
    try {
      fs.writeFileSync(file, req.file.buffer, { mode: 0o600 });
      let d: number | undefined;
      try {
        d = await duration(file);
      } catch (error) {
        // MediaRecorder WebM streams can omit container duration. Decode the
        // complete ordered stream before measuring it; never count chunks.
        if (![".webm", ".ogg"].includes(ext)) throw error;
      }
      await convertAudio(file, playback, undefined, undefined, 7201);
      const decodedDuration = await duration(playback);
      d ??= decodedDuration;
      let captureSegments: Session["recordingSegments"] = [];
      if (capture) {
        const recordedEnd = capture.intervals.at(-1)?.mediaEnd || 0;
        if (
          !capture.interrupted &&
          capture.intervals.length &&
          Math.abs(recordedEnd - d) < 1
        ) {
          captureSegments = structuredClone(capture.intervals);
          captureSegments[captureSegments.length - 1].mediaEnd = d;
          try {
            validateSegments(captureSegments, d);
          } catch {
            captureSegments = [];
          }
        }
        if (!captureSegments.length)
          capture.warnings.push(
            "Capture timing could not be reconciled with decoded audio. Use manual photo alignment; no exact recording intervals were inferred.",
          );
      }
      s.audio = {
        name: path.basename(req.file.originalname),
        original,
        playback: "audio.mp3",
        duration: d,
        sha256: hash(req.file.buffer),
      };
      if (s.recordingStart)
        s.recordingSegments = [
          {
            wallStart: s.recordingStart,
            wallEnd: new Date(
              Date.parse(s.recordingStart) + d * 1000,
            ).toISOString(),
            mediaStart: 0,
            mediaEnd: d,
          },
        ];
      if (capture) {
        s.capture = capture;
        s.recordingStart = capture.startedAt;
        s.recordingSegments = captureSegments;
      }
      s.evidenceRevision++;
      realign(s);
      save(s);
      res.json(s);
    } catch (e) {
      for (const f of [file, playback]) if (fs.existsSync(f)) fs.unlinkSync(f);
      throw e;
    } finally {
      imports.delete(s.id);
    }
  },
);
app.post(
  "/api/sessions/:id/photos",
  photoUpload.single("photo"),
  async (req, res) => {
    const s = session(req.params.id);
    idle(s);
    if (s.photos.length >= 30) throw new Error("Limit: 30 photos per session.");
    if (!req.file) throw new Error("Choose a photo.");
    imports.add(s.id);
    try {
      const photo = await importPhoto(s, req.file);
      s.photos.push(photo);
      s.evidenceRevision++;
      realign(s);
      save(s);
      res.json(s);
    } finally {
      imports.delete(s.id);
    }
  },
);
app.patch("/api/sessions/:id/photos/:photoId", (req, res) => {
  const s = session(req.params.id);
  idle(s);
  const p = s.photos.find((p) => p.id === req.params.photoId);
  if (!p) throw new Error("Photo not found.");
  const v = z
    .object({
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
      unmatched: z.boolean().optional(),
      reset: z.boolean().optional(),
    })
    .parse(req.body);
  if (v.reset) {
    p.alignment.manual = false;
    realign(s);
  } else {
    if (
      !v.unmatched &&
      (!s.audio || v.end <= v.start || v.end > s.audio.duration)
    )
      throw new Error(
        "Use an interval within the recording, with end after start.",
      );
    p.alignment = {
      start: v.start,
      end: v.end,
      status: v.unmatched ? "unmatched" : "matched",
      reason: v.unmatched
        ? "Marked unmatched by attendee."
        : "Interval confirmed by attendee.",
      manual: true,
    };
  }
  s.evidenceRevision++;
  save(s);
  res.json(s);
});
app.patch("/api/sessions/:id/transcript/:segmentId", (req, res) => {
  const s = session(req.params.id);
  idle(s);
  const t = s.transcript.find((t) => t.id === req.params.segmentId);
  if (!t) throw new Error("Transcript segment not found.");
  const { text } = z
    .object({ text: z.string().min(1).max(20000) })
    .parse(req.body);
  t.revisions.push({ text: t.text, at: new Date().toISOString() });
  t.text = text;
  t.edited = true;
  s.evidenceRevision++;
  save(s);
  res.json(s);
});
app.patch("/api/sessions/:id/notes/:sectionId", (req, res) => {
  const s = session(req.params.id);
  idle(s);
  if (!s.notes) throw new Error("Generate notes first.");
  const patch = z
    .object({
      title: z.string().min(1).max(500),
      claims: z.array(claimSchema).min(1).max(100),
      userNote: z.string().max(20000),
    })
    .parse(req.body);
  const notes = structuredClone(s.notes);
  const section = notes.sections.find((v) => v.id === req.params.sectionId);
  if (!section) throw new Error("Section not found.");
  Object.assign(section, patch, { edited: true });
  validateNotes(s, notes);
  s.noteHistory.push(s.notes);
  s.notes = notes;
  save(s);
  res.json(s);
});
app.post("/api/sessions/:id/candidate", (req, res) => {
  const s = session(req.params.id);
  idle(s);
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  if (accept) {
    if (!s.candidateNotes) throw new Error("No candidate draft.");
    validateNotes(s, s.candidateNotes);
    if (s.notes) s.noteHistory.push(s.notes);
    s.notes = s.candidateNotes;
  }
  delete s.candidateNotes;
  save(s);
  res.json(s);
});
app.post("/api/sessions/:id/process", (req, res) => {
  const s = session(req.params.id);
  idle(s);
  const { stage } = z
    .object({ stage: z.enum(["all", "transcribe", "photos", "notes"]) })
    .parse(req.body);
  startJob(s, stage);
  res.status(202).json(s);
});
app.post("/api/sessions/:id/cancel", async (req, res) => {
  const s = session(req.params.id);
  await cancelJob(s.id);
  res.json(s);
});
app.delete("/api/sessions/:id", async (req, res) => {
  const s = session(req.params.id);
  if (imports.has(s.id))
    throw new Error("Wait for import to finish before deletion.");
  deleting.add(s.id);
  try {
    await cancelJob(s.id);
    removeSession(s);
    res.status(204).end();
  } finally {
    deleting.delete(s.id);
  }
});
app.get("/api/sessions/:id/media/:filename", (req, res) => {
  const s = session(req.params.id);
  const allowed = [
    s.audio?.original,
    s.audio?.playback,
    ...s.photos.flatMap((p) => [p.original, p.display]),
  ];
  if (!allowed.includes(req.params.filename)) return res.status(404).end();
  res.sendFile(path.join(dir(s.id), req.params.filename), {
    dotfiles: "allow",
  });
});
app.get("/api/sessions/:id/export.html", (req, res) => {
  const s = session(req.params.id);
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="talkweave-notes.html"',
  );
  res.type("html").send(exportHtml(s));
});
app.get("/api/sessions/:id/manifest.json", (req, res) => {
  const s = session(req.params.id);
  if (!s.notes) throw new Error("Generate notes first.");
  validateNotes(s, s.notes);
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="talkweave-manifest.json"',
  );
  res.json(manifest(s));
});
app.get("/api/sessions/:id/bundle.zip", (req, res) => {
  const s = session(req.params.id);
  const html = exportHtml(s, true);
  res.attachment("talkweave-evidence.zip");
  res.send(
    Buffer.from(
      zipSync(
        {
          "index.html": strToU8(html),
          "manifest.json": strToU8(JSON.stringify(manifest(s, true), null, 2)),
          [`audio${path.extname(s.audio!.playback)}`]: fs.readFileSync(
            path.join(dir(s.id), s.audio!.playback),
          ),
          "README.txt": strToU8(
            "Extract this ZIP, then open index.html. Real-session audio is a normalized MP3 derivative. Demo fixture audio is silence. Original photos are excluded; display images have no GPS metadata.\n",
          ),
        },
        { level: 0 },
      ),
    ),
  );
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API route not found." }),
);
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      typeof err === "object" && err && "status" in err
        ? Number(err.status)
        : 400;
    res.status(status >= 400 && status < 600 ? status : 400).json({
      error:
        err instanceof z.ZodError
          ? "Invalid input. Check field formats and limits."
          : err instanceof multer.MulterError
            ? "Upload exceeds the file/count limit. Audio: 250 MB; each photo: 20 MB."
            : safeError(err),
    });
  },
);
// Bind first: a second process must not start Vite or claim it is ready.
// HMR shares the HTTP listener, so no separate port 3001 can be orphaned.
let ready = false;
const server = createHttpServer((req, res) => {
  if (!ready) {
    res.writeHead(503, { "Retry-After": "1" });
    res.end("TalkWeave is starting. Retry shortly.");
    return;
  }
  app(req, res);
});
let vite: import("vite").ViteDevServer | undefined;
try {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  recoverInterruptedJobs();
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.resolve("dist")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.resolve("dist/index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    vite = await createServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  ready = true;
  console.log(
    `TalkWeave: http://127.0.0.1:${port} · local private storage · ${process.env.OPENAI_API_KEY ? "API key configured (not yet verified)" : "API key missing; demo available"}`,
  );
  const shutdown = async () => {
    server.close();
    await Promise.all([...jobs.keys()].map(cancelJob));
    await vite?.close();
    server.closeAllConnections();
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
} catch (error) {
  await vite?.close();
  server.close();
  console.error(
    (error as NodeJS.ErrnoException).code === "EADDRINUSE"
      ? `TalkWeave could not start: port ${port} is already in use. Stop the existing TalkWeave server (Ctrl+C in its terminal), then run npm run dev again. No new server was started.`
      : "TalkWeave could not start. Check the local port and build configuration.",
  );
  process.exitCode = 1;
}
