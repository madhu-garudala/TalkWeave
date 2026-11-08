import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { createSession, dir, save, removeSession } from "./store.js";
import { importPhoto, hash } from "./media.js";
export async function fixture() {
  const s = createSession("Building resilient event pipelines", "fixture");
  try {
    s.speaker = "Demo speaker";
    s.event = "Synthetic evaluation fixture";
    const text = [
      "Our synchronous checkout waits for inventory and email. If email is slow, checkout is slow. A queue separates accepting work from completing it. This is a teaching example, not a production benchmark.",
      "The API writes an event to a durable queue. A worker processes it and records the result. Delivery is at least once: the same event may arrive twice. We use an idempotency key to avoid applying the same change twice. We did not measure throughput in this example.",
      "A failed job is retried with exponential backoff. After the retry limit, send it to a dead letter queue for inspection. This adds operational work and eventual consistency. A queue does not make failures disappear. Question: does this guarantee exactly once delivery? No; our claim is at least once delivery with idempotent processing.",
    ];
    const duration = 90;
    // Silence is deliberately not a speech recording; the UI and fixture documentation say so.
    const wav = Buffer.alloc(44 + 16000 * 2 * duration);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24);
    wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    fs.writeFileSync(path.join(dir(s.id), "fixture.wav"), wav);
    s.audio = {
      name: "demo-silence.wav",
      original: "fixture.wav",
      playback: "fixture.wav",
      duration,
      sha256: hash(wav),
    };
    s.transcript = text.map((t, i) => ({
      id: `t-${i}-0`,
      start: i * 30,
      end: (i + 1) * 30,
      text: t,
      rawText: t,
      edited: false,
      timing: "window",
      revisions: [],
    }));
    s.transcriptionComplete = true;
    s.completedChunks = [0, 1, 2];
    const slides = [
      {
        title: "Decouple acceptance from work",
        labels: [
          "API → Durable queue → Worker",
          "At-least-once delivery",
          "Idempotency key → safe retries",
        ],
      },
      {
        title: "Failures remain visible",
        labels: [
          "Retry with exponential backoff",
          "Retry limit → Dead letter queue",
          "Tradeoff: eventual consistency",
        ],
      },
    ];
    for (const [i, slide] of slides.entries()) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><rect width="1200" height="720" fill="#182921"/><text x="70" y="90" fill="#afd2a2" font-family="sans-serif" font-size="24">TALKWEAVE / DEMO SLIDE ${i + 1}</text><text x="70" y="210" fill="#f4f5e9" font-family="sans-serif" font-size="46">${slide.title}</text>${slide.labels.map((l, j) => `<text x="70" y="${330 + j * 100}" fill="#dae2d4" font-family="sans-serif" font-size="34">${l}</text>`).join("")}<text x="70" y="665" fill="#a8b8ad" font-family="sans-serif" font-size="18">Synthetic fixture · no real talk or provider output</text></svg>`;
      const p = await importPhoto(s, {
        originalname: `demo-slide-${i + 1}.jpg`,
        buffer: await sharp(Buffer.from(svg)).jpeg().toBuffer(),
      });
      p.analysis = {
        text: slide.labels.join("\n"),
        description: slide.title,
        uncertainties: [],
      };
      p.alignment = {
        start: i === 0 ? 60 : 60,
        end: 90,
        status: "needs-review",
        reason:
          i === 0
            ? "Deliberately incorrect fixture match. Correct to 30–60 seconds to test persistence."
            : "Fixture suggestion; verify against the transcript.",
        manual: false,
      };
      s.photos.push(p);
    }
    s.notes = {
      generatedAt: new Date().toISOString(),
      inputRevision: 0,
      sections: [
        {
          id: "section-1",
          title: "Why introduce a queue?",
          claims: [
            {
              kind: "speaker-statement",
              text: "The synchronous checkout waits on inventory and email, so a slow email step delays checkout. A queue separates accepting the work from completing it. The speaker presents this as a teaching example and does not claim measured performance improvements.",
              transcriptIds: ["t-0-0"],
              photoIds: [],
            },
          ],
          userNote: "",
          edited: false,
        },
        {
          id: "section-2",
          title: "At-least-once delivery, idempotent processing",
          claims: [
            {
              kind: "speaker-statement",
              text: "The API writes an event to a durable queue. A worker processes the event and records the result. Since the same event can be delivered more than once, an idempotency key prevents applying the same change twice. No throughput measurements are provided.",
              transcriptIds: ["t-1-0"],
              photoIds: [],
            },
            {
              kind: "slide-observation",
              text: "The slide shows API → Durable queue → Worker and connects idempotency keys with safe retries. This image alone does not establish production deployment.",
              transcriptIds: [],
              photoIds: [s.photos[0].id],
            },
          ],
          userNote: "",
          edited: false,
        },
        {
          id: "section-3",
          title: "Retries, failure handling, and tradeoffs",
          claims: [
            {
              kind: "speaker-statement",
              text: "Failed jobs retry with exponential backoff. Jobs that reach the retry limit go to a dead letter queue for inspection. The tradeoffs are operational work and eventual consistency. In the audience question, the speaker explicitly rejects an exactly-once delivery guarantee: the claim is at-least-once delivery with idempotent processing.",
              transcriptIds: ["t-2-0"],
              photoIds: [],
            },
            {
              kind: "slide-observation",
              text: "The second slide lists exponential backoff, a retry limit leading to a dead letter queue, and eventual consistency as a tradeoff.",
              transcriptIds: [],
              photoIds: [s.photos[1].id],
            },
          ],
          userNote: "",
          edited: false,
        },
      ],
    };
    s.job = {
      status: "completed",
      stage: "fixture",
      progress:
        "Demo fixture: authored transcript and notes; audio is silence. No OpenAI requests.",
    };
    save(s);
    return s;
  } catch (e) {
    removeSession(s);
    throw e;
  }
}
