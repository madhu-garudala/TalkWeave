import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import exifr from "exifr";
import type { Photo, Session } from "../shared/types.js";
import { dir } from "./store.js";
const exec = promisify(execFile);
export const hash = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");
export const hasFFmpeg = async () => {
  try {
    await exec("ffmpeg", ["-version"]);
    await exec("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
};
export async function duration(file: string) {
  let out;
  try {
    out = await exec(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "json", file],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
  } catch {
    throw new Error(
      "Cannot decode audio. Install ffmpeg/ffprobe and use a valid supported audio file.",
    );
  }
  const n = Number(JSON.parse(out.stdout).format.duration);
  if (!Number.isFinite(n) || n <= 0 || n > 7200)
    throw new Error("Audio must be between 0 and 120 minutes.");
  return n;
}
export async function convertAudio(
  input: string,
  output: string,
  signal?: AbortSignal,
  start?: number,
  length?: number,
) {
  await exec(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-y",
      ...(start === undefined ? [] : ["-ss", String(start)]),
      "-i",
      input,
      ...(length === undefined ? [] : ["-t", String(length)]),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      output,
    ],
    { signal, timeout: 180000, maxBuffer: 1024 * 1024 },
  );
}
export async function importPhoto(
  s: Session,
  file: { originalname: string; buffer: Buffer },
): Promise<Photo> {
  const metadata = await sharp(file.buffer, { limitInputPixels: 60_000_000 })
    .metadata()
    .catch(() => {
      throw new Error(
        "Unreadable image. Use JPEG or PNG. For HEIC, export JPEG from Photos (File → Export → Export Photos) before importing.",
      );
    });
  if (!["jpeg", "png"].includes(metadata.format!))
    throw new Error(
      "Only JPEG and PNG are supported. Export HEIC as JPEG from Photos (File → Export → Export Photos), preserving capture metadata when possible.",
    );
  const digest = hash(file.buffer);
  if (s.photos.some((p) => p.sha256 === digest))
    throw new Error(
      "This exact photo is already imported. Its original and alignment are preserved.",
    );
  const id = "p-" + randomUUID();
  const original = `${id}.${metadata.format === "jpeg" ? "jpg" : "png"}`;
  const display = `${id}-display.jpg`;
  const exif = await exifr
    .parse(file.buffer, {
      pick: ["DateTimeOriginal", "OffsetTimeOriginal"],
      reviveValues: false,
      translateValues: false,
    })
    .catch(() => null);
  const raw = exif?.DateTimeOriginal;
  const captureTime =
    typeof raw === "string" &&
    /^\d{4}:\d{2}:\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(raw)
      ? raw.slice(0, 19).replace(/^(\d{4}):(\d{2}):(\d{2})[ T]/, "$1-$2-$3T")
      : null;
  fs.writeFileSync(path.join(dir(s.id), original), file.buffer, {
    mode: 0o600,
  });
  try {
    await sharp(file.buffer)
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toFile(path.join(dir(s.id), display));
  } catch (e) {
    fs.unlinkSync(path.join(dir(s.id), original));
    throw e;
  }
  return {
    id,
    name: path.basename(file.originalname),
    original,
    display,
    sha256: digest,
    captureTime,
    captureOffset:
      typeof exif?.OffsetTimeOriginal === "string"
        ? exif.OffsetTimeOriginal
        : null,
    alignment: {
      start: 0,
      end: 0,
      status: "unmatched",
      reason: "Not aligned yet.",
      manual: false,
    },
  };
}
