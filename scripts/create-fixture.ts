import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const directory = path.resolve("fixtures/generated");
fs.mkdirSync(directory, { recursive: true });
const script = `This is a synthetic TalkWeave test, not a recording of a real event. Our synchronous checkout waits for inventory and email. When email is slow, checkout becomes slow. A queue separates accepting work from completing it. The first slide shows an API, a durable queue, and a worker. Delivery is at least once. An event can arrive twice. We use an idempotency key to avoid applying the same change twice. We did not measure throughput. The second slide shows retry handling. A failed job retries with exponential backoff. After the retry limit, it moves to a dead letter queue for inspection. This adds operational work and eventual consistency. Does it guarantee exactly once delivery? No. The claim is at least once delivery with idempotent processing. The small label in the lower right is unreadable. We should not guess it.`;
fs.writeFileSync(path.join(directory, "expected-script.txt"), script);
for (const [i, title, lines] of [
  [
    1,
    "Decouple acceptance from work",
    [
      "API → Durable queue → Worker",
      "At-least-once delivery",
      "Idempotency key → safe retries",
    ],
  ],
  [
    2,
    "Failures remain visible",
    [
      "Exponential backoff",
      "Retry limit → Dead letter queue",
      "Tradeoff: eventual consistency",
    ],
  ],
] as const) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900"><rect width="1400" height="900" fill="#f2eedf"/><text x="80" y="110" font-family="sans-serif" font-size="25" fill="#4e6855">TALKWEAVE SYNTHETIC TEST / ${i}</text><text x="80" y="270" font-family="sans-serif" font-size="58" fill="#24382b">${title}</text>${lines.map((v, j) => `<text x="80" y="${410 + j * 120}" font-family="sans-serif" font-size="42" fill="#365240">${v}</text>`).join("")}<text x="1250" y="850" font-family="sans-serif" font-size="3">unclear</text></svg>`;
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toFile(path.join(directory, `slide-${i}.jpg`));
}
try {
  if (process.platform === "darwin") {
    execFileSync("say", [
      "-r",
      "155",
      "-o",
      path.join(directory, "speech.aiff"),
      script,
    ]);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      path.join(directory, "speech.aiff"),
      path.join(directory, "synthetic-talk.m4a"),
    ]);
  } else {
    execFileSync("espeak", [
      "-s",
      "155",
      "-w",
      path.join(directory, "speech.wav"),
      script,
    ]);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      path.join(directory, "speech.wav"),
      path.join(directory, "synthetic-talk.m4a"),
    ]);
  }
  console.log(
    "Generated synthetic spoken audio and two authored slide images in fixtures/generated. This is not a real talk recording and has no EXIF timestamps.",
  );
} catch {
  console.error(
    "Slide fixtures and script were generated. Speech creation needs macOS say or Linux espeak, plus ffmpeg. No silent fallback is counted as speech.",
  );
  process.exitCode = 1;
}
