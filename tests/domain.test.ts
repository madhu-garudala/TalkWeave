import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fixture } from "../server/fixture.js";
import { notesSchemaFor } from "../server/provider.js";
import {
  alignPhoto,
  validateNotes,
  validateSegments,
} from "../server/domain.js";
import { exportHtml, manifest } from "../server/export.js";
import {
  dir,
  removeSession,
  createSession,
  save,
  sessions,
} from "../server/store.js";
import { importPhoto } from "../server/media.js";
import type { Session } from "../shared/types.js";
const created: Session[] = [];
async function demo() {
  const s = await fixture();
  created.push(s);
  return s;
}
after(() =>
  created.forEach((s) => {
    if (sessions.has(s.id)) removeSession(s);
  }),
);
test("photo wall-clock offset maps across pauses, and manual corrections survive", async () => {
  const s = await demo();
  s.recordingStart = "2026-11-07T12:00:00Z";
  s.photoTimezone = "Z";
  s.recordingSegments = [
    {
      wallStart: "2026-11-07T12:00:00Z",
      wallEnd: "2026-11-07T12:00:30Z",
      mediaStart: 0,
      mediaEnd: 30,
    },
    {
      wallStart: "2026-11-07T12:01:00Z",
      wallEnd: "2026-11-07T12:02:00Z",
      mediaStart: 30,
      mediaEnd: 90,
    },
  ];
  const p = s.photos[0];
  p.captureTime = "2026-11-07T12:04:20";
  s.deviceOffset = -180;
  let a = alignPhoto(s, p);
  assert.equal(a.start, 30);
  assert.equal(a.end, 65);
  assert.equal(a.status, "needs-review");
  p.captureTime = "2026-11-07T12:03:45";
  a = alignPhoto(s, p);
  assert.equal(a.status, "unmatched");
  assert.match(a.reason, /pause/);
  p.alignment = {
    start: 30,
    end: 60,
    status: "matched",
    manual: true,
    reason: "Attendee corrected",
  };
  s.deviceOffset = 0;
  assert.deepEqual(alignPhoto(s, p), p.alignment);
  save(s);
  const reloaded = JSON.parse(
    fs.readFileSync(path.join(dir(s.id), "session.json"), "utf8"),
  );
  assert.equal(reloaded.photos[0].alignment.manual, true);
  assert.equal(reloaded.photos[0].alignment.start, 30);
});
test("unknown clock never uses upload time, missing EXIF can suggest content with uncertainty", async () => {
  const s = await demo();
  const p = s.photos[0];
  p.captureTime = null;
  delete p.analysis;
  assert.equal(alignPhoto(s, p).status, "unmatched");
  p.analysis = {
    text: "idempotency key durable queue delivery",
    description: "",
    uncertainties: [],
  };
  const a = alignPhoto(s, p);
  assert.equal(a.status, "needs-review");
  assert.equal(a.start, 30);
  assert.match(a.reason, /Content suggestion/);
  p.captureTime = "2026-11-07T12:00:10";
  p.captureOffset = null;
  s.photoTimezone = "";
  delete p.analysis;
  assert.equal(alignPhoto(s, p).status, "unmatched");
});
test("timeline rejects overlapping segments and unequal wall/media lengths", () => {
  assert.throws(
    () =>
      validateSegments(
        [
          {
            wallStart: "2026-11-07T12:00:00Z",
            wallEnd: "2026-11-07T12:01:00Z",
            mediaStart: 0,
            mediaEnd: 30,
          },
        ],
        90,
      ),
    /matching/,
  );
  assert.throws(() =>
    validateSegments(
      [
        {
          wallStart: "invalid",
          wallEnd: "invalid",
          mediaStart: 0,
          mediaEnd: 20,
        },
      ],
      90,
    ),
  );
});
test("every generated claim must resolve; invented quotes and speaker-only photo citations are rejected", async () => {
  const s = await demo();
  assert.doesNotThrow(() => validateNotes(s, s.notes!));
  const notes = structuredClone(s.notes!);
  notes.sections[0].claims[0].transcriptIds = ["nonexistent"];
  assert.throws(() => validateNotes(s, notes), /resolve/);
  notes.sections[0].claims[0] = {
    kind: "direct-quote",
    text: "Invented exact words",
    transcriptIds: ["t-0-0"],
    photoIds: [],
  };
  assert.throws(() => validateNotes(s, notes), /exact/);
  notes.sections[0].claims[0] = {
    kind: "speaker-statement",
    text: "Claim",
    transcriptIds: [],
    photoIds: [s.photos[0].id],
  };
  assert.throws(() => validateNotes(s, notes), /transcript/);
});
test("portable HTML embeds images, escapes hostile sources, resolves anchors, and excludes external dependencies", async () => {
  const s = await demo();
  s.title = "<script>alert(1)</script>";
  s.transcript[0].text = "<img src=x onerror=alert(1)> & hostile instruction";
  s.notes!.sections[0].claims[0].text =
    '</p><script>fetch("https://evil.example")</script>';
  s.notes!.sections[0].userNote = "<svg onload=alert(1)>";
  const html = exportHtml(s);
  assert.ok(html.includes("data:image/jpeg;base64,"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<svg onload"));
  assert.ok(html.includes("Audio is not included"));
  assert.ok(!html.includes("<audio"));
  assert.ok(!/<(?:script|link|img)[^>]+(?:src|href)="https?:/.test(html));
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g))
    assert.ok(ids.has(match[1]), match[1]);
  assert.equal(manifest(s).originalImagesIncluded, false);
  assert.equal(manifest(s).audioIncluded, false);
  fs.renameSync(
    path.join(dir(s.id), s.photos[0].display),
    path.join(dir(s.id), "missing.jpg"),
  );
  assert.throws(() => exportHtml(s), /missing/);
});
test("image originals retain metadata; display images remove GPS and EXIF while capture time is preserved", async () => {
  const s = createSession("Metadata fixture");
  created.push(s);
  const bytes = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "#123456" },
  })
    .jpeg()
    .withExif({
      IFD0: { Artist: "Test" },
      IFD2: {
        DateTimeOriginal: "2026:11:07 12:34:56",
        OffsetTimeOriginal: "-05:00",
      },
    })
    .toBuffer();
  const p = await importPhoto(s, { originalname: "clock.jpg", buffer: bytes });
  s.photos.push(p);
  assert.deepEqual(fs.readFileSync(path.join(dir(s.id), p.original)), bytes);
  assert.equal(p.captureTime, "2026-11-07T12:34:56");
  assert.equal(p.captureOffset, "-05:00");
  const metadata = await sharp(path.join(dir(s.id), p.display)).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  await assert.rejects(
    () => importPhoto(s, { originalname: "same.jpg", buffer: bytes }),
    /already imported/,
  );
});

test("generation schema rejects uncited claims and IDs from outside the current session", async () => {
  const s = await demo();
  const schema = notesSchemaFor(s);
  assert.throws(() =>
    schema.parse({
      sections: [
        {
          title: "Missing evidence",
          claims: [
            {
              kind: "speaker-statement",
              text: "Uncited",
              transcriptIds: [],
              photoIds: [],
            },
          ],
        },
      ],
    }),
  );
  assert.throws(() =>
    schema.parse({
      sections: [
        {
          title: "Wrong source",
          claims: [
            {
              kind: "speaker-statement",
              text: "Wrong reference",
              transcriptIds: ["other-session-id"],
              photoIds: [],
            },
          ],
        },
      ],
    }),
  );
  assert.doesNotThrow(() =>
    schema.parse({
      sections: s.notes!.sections.map(({ title, claims }) => ({
        title,
        claims,
      })),
    }),
  );
});
