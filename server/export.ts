import fs from "node:fs";
import path from "node:path";
import { dir } from "./store.js";
import { validateNotes } from "./domain.js";
import type { Session } from "../shared/types.js";
import { secondsLabel } from "../shared/types.js";
export const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function manifest(s: Session, audio = false) {
  return {
    schemaVersion: 1,
    capture: s.capture,
    session: {
      id: s.id,
      title: s.title,
      speaker: s.speaker,
      event: s.event,
      mode: s.mode,
    },
    exportedAt: new Date().toISOString(),
    audioIncluded: audio,
    originalImagesIncluded: false,
    notesStale: s.notes?.inputRevision !== s.evidenceRevision,
    recordingSegments: s.recordingSegments,
    photoTimezoneAssumption: s.photoTimezone,
    deviceOffsetSeconds: s.deviceOffset,
    audio: s.audio
      ? {
          name: s.audio.name,
          sha256: s.audio.sha256,
          duration: s.audio.duration,
          path: audio ? `audio${path.extname(s.audio.playback)}` : null,
        }
      : null,
    photos: s.photos.map(
      ({
        id,
        name,
        sha256,
        captureTime,
        captureOffset,
        alignment,
        analysis,
      }) => ({
        id,
        name,
        sha256,
        captureTime,
        captureOffset,
        alignment,
        analysis,
        display: `#${id}`,
      }),
    ),
    transcript: s.transcript,
    notes: s.notes,
  };
}
export function exportHtml(s: Session, audio = false) {
  if (!s.notes) throw new Error("Generate notes before exporting.");
  validateNotes(s, s.notes);
  if (
    audio &&
    (!s.audio || !fs.existsSync(path.join(dir(s.id), s.audio.playback)))
  )
    throw new Error("Audio is missing.");
  const e = escape;
  const photos = s.photos.map((p) => {
    const file = path.join(dir(s.id), p.display);
    if (!fs.existsSync(file))
      throw new Error("A display image is missing. Export blocked.");
    return `<figure id="${e(p.id)}"><img src="data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}" alt="${e(p.analysis?.description || p.name)}"><figcaption>${e(p.name)} · ${e(p.alignment.status)} · ${e(p.alignment.reason)}</figcaption><p>${e(p.analysis?.description || "Photo has not been analyzed.")}</p>${p.analysis?.uncertainties.map((u) => `<p>Uncertain: ${e(u)}</p>`).join("") || ""}<details><summary>Slide text</summary><p>${e(p.analysis?.text || "No extracted text.")}</p></details></figure>`;
  });
  const link = (id: string) => {
    const t = s.transcript.find((t) => t.id === id)!;
    return `<a href="#${e(id)}">${secondsLabel(t.start)}–${secondsLabel(t.end)}</a>`;
  };
  const sections = s.notes.sections
    .map(
      (section) =>
        `<section id="${e(section.id)}"><h2>${e(section.title)}</h2>${section.claims.map((c) => `<div class="claim"><small>${e(c.kind.replaceAll("-", " "))}</small><p>${e(c.text)}</p><div class="sources">Sources: ${c.transcriptIds.map(link).join(" · ")} ${c.photoIds.map((id) => `<a href="#${e(id)}">Photo ${s.photos.findIndex((p) => p.id === id) + 1}</a>`).join(" · ")}</div></div>`).join("")}${[...new Set(section.claims.flatMap((c) => c.photoIds))].map((id) => `<p><a href="#${e(id)}"><img class="inline-photo" src="data:image/jpeg;base64,${fs.readFileSync(path.join(dir(s.id), s.photos.find((p) => p.id === id)!.display)).toString("base64")}" alt="${e(s.photos.find((p) => p.id === id)!.analysis?.description || "Referenced slide")}"></a></p>`).join("")}${section.userNote ? `<aside><strong>User note</strong><p>${e(section.userNote)}</p></aside>` : ""}${section.edited ? "<small>Edited by attendee; inspect supporting sources.</small>" : ""}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; media-src 'self'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>${e(s.title)} — TalkWeave</title><style>
  :root{color-scheme:light dark}*{box-sizing:border-box}body{font:17px/1.7 system-ui,sans-serif;margin:0 auto;max-width:960px;padding:40px 24px;background:#faf9f5;color:#202b26}h1{font-size:2.5rem;line-height:1.15}h2{margin-top:2.5rem}a{color:#287052}small,.sources,figcaption{font-size:.85rem;color:#56645c}p{white-space:pre-wrap;overflow-wrap:anywhere}section,figure,aside{border-top:1px solid #b8c5ba;padding-top:20px}figure{margin:24px 0}img{max-width:100%;height:auto;border-radius:8px}.inline-photo{max-height:520px}nav{display:flex;gap:16px;flex-wrap:wrap}audio{width:100%}.claim{margin:20px 0}.sources{margin-top:8px}aside{padding:20px;background:#ecf1e8}li:target,section:target,figure:target{outline:3px solid #62ae84;outline-offset:8px}details{margin-top:24px}summary{cursor:pointer}li{padding:12px 0}header{border-bottom:1px solid #b8c5ba;padding-bottom:24px}@media(prefers-color-scheme:dark){body{background:#101713;color:#e3e9df}a{color:#a9d5b3}small,.sources,figcaption{color:#a5b3a8}aside{background:#1c2b21}}@media print{body{background:white;color:black;font-size:11pt;padding:0}a,small,.sources,figcaption{color:#333}img,figure{break-inside:avoid;max-height:90vh}audio{display:none}details{display:block}h2{break-after:avoid}}
  </style></head><body><header><small>TALKWEAVE · SOURCE-LINKED NOTES${s.mode === "fixture" ? " · DEMO FIXTURE — NOT A LIVE INTEGRATION" : ""}</small><h1>${e(s.title)}</h1><p>${e([s.speaker, s.event].filter(Boolean).join(" · "))}</p><p>${audio ? "Audio included in the extracted evidence bundle. Use the player and source timestamps." : "Audio is not included. Timestamps identify transcript evidence; playback requires the original recording."}</p>${audio ? `<audio controls preload="metadata" src="audio${path.extname(s.audio!.playback)}"></audio>` : ""}${s.notes.inputRevision !== s.evidenceRevision ? "<p><strong>Evidence changed after these notes were generated. Review the sources; these notes may be out of date.</strong></p>" : ""}<nav>${s.notes.sections.map((v) => `<a href="#${e(v.id)}">${e(v.title)}</a>`).join("")}<a href="#photos">Photos</a><a href="#transcript">Transcript</a></nav></header><main>${sections}<section id="photos"><h2>Source photographs</h2>${photos.join("")}</section><section id="transcript"><h2>Timestamped transcript</h2><p>Use your browser’s Find to search. Window timestamps bound the supplied audio excerpt; they are not word-level timings. Corrections retain the original model text.</p><ol>${s.transcript.map((t) => `<li id="${e(t.id)}"><strong>${secondsLabel(t.start)}–${secondsLabel(t.end)}</strong> <small>${t.timing === "window" ? "source window" : "model segment"}${t.edited ? " · corrected by attendee" : ""}</small><p>${e(t.text)}</p>${t.edited ? `<details><summary>Original transcription</summary><p>${e(t.rawText)}</p></details>` : ""}</li>`).join("")}</ol></section></main><footer><p>Created with TalkWeave. Images are embedded and display metadata is stripped. AI-generated claims require human review of their sources.</p></footer></body></html>`;
}
