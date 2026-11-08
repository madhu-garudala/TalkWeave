import type { Alignment, Notes, Photo, Session } from "../shared/types.js";

export function captureInstant(photo: Photo, timezone: string): number | null {
  if (!photo.captureTime) return null;
  const suffix = photo.captureOffset || timezone;
  if (!/^(Z|[+-]\d{2}:\d{2})$/.test(suffix)) return null;
  const value = Date.parse(photo.captureTime + suffix);
  return Number.isFinite(value) ? value : null;
}
export function alignPhoto(session: Session, photo: Photo): Alignment {
  if (photo.alignment.manual) return photo.alignment;
  const none = (reason: string): Alignment => ({
    start: 0,
    end: 0,
    status: "unmatched",
    reason,
    manual: false,
  });
  const instant = captureInstant(photo, session.photoTimezone);
  if (instant === null)
    return (
      contentMatch(session, photo) ||
      none(
        "No usable capture time or timezone. Set a manual interval or inspect content suggestions.",
      )
    );
  if (!session.recordingSegments.length)
    return (
      contentMatch(session, photo) ||
      none(
        "Recording start is unknown. Set the actual start time or match manually.",
      )
    );
  const corrected = instant + session.deviceOffset * 1000;
  const segment = session.recordingSegments.find(
    (s) =>
      corrected >= Date.parse(s.wallStart) &&
      corrected <= Date.parse(s.wallEnd),
  );
  if (!segment)
    return none(
      "Capture falls outside recorded intervals or in a pause. No exact audio counterpart; match manually if context supports it.",
    );
  const moment =
    segment.mediaStart + (corrected - Date.parse(segment.wallStart)) / 1000;
  return {
    start: Math.max(segment.mediaStart, moment - 30),
    end: Math.min(segment.mediaEnd, moment + 15),
    status: "needs-review",
    reason: `Capture-time suggestion; allows for a delayed photo.${photo.captureOffset ? "" : ` Assumes photo timezone ${session.photoTimezone}.`} Review nearby speech.`,
    manual: false,
  };
}
function contentMatch(session: Session, photo: Photo): Alignment | null {
  if (!photo.analysis) return null;
  const words = new Set(
    photo.analysis.text.toLowerCase().match(/[a-z0-9]{4,}/g) || [],
  );
  const ranked = session.transcript
    .map((t) => ({
      t,
      hits: [
        ...new Set(t.text.toLowerCase().match(/[a-z0-9]{4,}/g) || []),
      ].filter((w) => words.has(w)).length,
    }))
    .sort((a, b) => b.hits - a.hits);
  if (
    !ranked.length ||
    ranked[0].hits < 2 ||
    ranked[0].hits === ranked[1]?.hits
  )
    return null;
  return {
    start: ranked[0].t.start,
    end: ranked[0].t.end,
    status: "needs-review",
    reason:
      "Slide text overlaps this transcript window. Content suggestion only; capture time is unavailable or unanchored.",
    manual: false,
  };
}
export function realign(session: Session) {
  session.photos.forEach((p) => {
    p.alignment = alignPhoto(session, p);
  });
}
export function validateNotes(session: Session, notes: Notes) {
  if (!notes.sections.length) throw new Error("Notes contain no sections.");
  const sectionIds = new Set<string>();
  for (const section of notes.sections) {
    if (!/^[a-zA-Z0-9_-]+$/.test(section.id) || sectionIds.has(section.id))
      throw new Error("Invalid or duplicate section ID.");
    sectionIds.add(section.id);
    if (!section.claims.length)
      throw new Error("A generated section has no evidence.");
    for (const claim of section.claims) {
      if (!claim.transcriptIds.length && !claim.photoIds.length)
        throw new Error("A claim has no source references.");
      if (
        claim.transcriptIds.some(
          (id) => !session.transcript.some((t) => t.id === id),
        ) ||
        claim.photoIds.some((id) => !session.photos.some((p) => p.id === id))
      )
        throw new Error("A source reference does not resolve.");
      if (
        (claim.kind === "speaker-statement" || claim.kind === "direct-quote") &&
        !claim.transcriptIds.length
      )
        throw new Error("Speaker claims require transcript evidence.");
      if (claim.kind === "slide-observation" && !claim.photoIds.length)
        throw new Error("Slide observations require image evidence.");
      if (
        claim.kind === "direct-quote" &&
        !claim.transcriptIds.some((id) =>
          session.transcript
            .find((t) => t.id === id)!
            .text.includes(claim.text),
        )
      )
        throw new Error("Direct quote is not exact transcript text.");
    }
  }
}
export function validateSegments(
  segments: Session["recordingSegments"],
  duration: number,
) {
  let lastWall = -Infinity,
    lastMedia = 0;
  for (const s of segments) {
    const start = Date.parse(s.wallStart),
      end = Date.parse(s.wallEnd);
    if (
      ![start, end, s.mediaStart, s.mediaEnd].every(Number.isFinite) ||
      start < lastWall ||
      end <= start ||
      s.mediaStart < lastMedia ||
      s.mediaEnd <= s.mediaStart ||
      s.mediaEnd > duration + 0.1 ||
      Math.abs((end - start) / 1000 - (s.mediaEnd - s.mediaStart)) > 1
    )
      throw new Error(
        "Recording intervals must be ordered, non-overlapping, within audio duration, and have matching wall-clock/media lengths.",
      );
    lastWall = end;
    lastMedia = s.mediaEnd;
  }
}

export function validateCoverage(session: Session, notes: Notes) {
  const claims = notes.sections.flatMap((s) => s.claims);
  const textIds = new Set(claims.flatMap((c) => c.transcriptIds));
  const photoIds = new Set(claims.flatMap((c) => c.photoIds));
  if (
    session.transcript.some((t) => !textIds.has(t.id)) ||
    session.photos.some((p) => !photoIds.has(p.id))
  ) {
    throw new Error(
      "Generated notes omitted one or more source windows or photographs. Completed evidence is saved; retry notes generation to produce the complete notebook.",
    );
  }
}
