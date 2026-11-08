export type Transcript = {
  id: string;
  start: number;
  end: number;
  text: string;
  rawText: string;
  edited: boolean;
  timing: "window" | "segment";
  revisions: { text: string; at: string }[];
};
export type RecordingSegment = {
  wallStart: string;
  wallEnd: string;
  mediaStart: number;
  mediaEnd: number;
};
export type Alignment = {
  start: number;
  end: number;
  status: "matched" | "needs-review" | "unmatched";
  reason: string;
  manual: boolean;
};
export type Photo = {
  id: string;
  name: string;
  original: string;
  display: string;
  sha256: string;
  captureTime: string | null;
  captureOffset: string | null;
  alignment: Alignment;
  analysis?: { text: string; description: string; uncertainties: string[] };
};
export type Claim = {
  kind:
    | "speaker-statement"
    | "direct-quote"
    | "slide-observation"
    | "added-explanation";
  text: string;
  transcriptIds: string[];
  photoIds: string[];
};
export type Section = {
  id: string;
  title: string;
  claims: Claim[];
  userNote: string;
  edited: boolean;
};
export type Notes = {
  sections: Section[];
  generatedAt: string;
  inputRevision: number;
};
export type Session = {
  id: string;
  title: string;
  speaker: string;
  event: string;
  createdAt: string;
  revision: number;
  evidenceRevision: number;
  mode: "live" | "fixture";
  recordingStart: string | null;
  photoTimezone: string;
  deviceOffset: number;
  recordingSegments: RecordingSegment[];
  audio?: {
    name: string;
    original: string;
    playback: string;
    duration: number;
    sha256: string;
  };
  photos: Photo[];
  transcript: Transcript[];
  transcriptionComplete: boolean;
  completedChunks: number[];
  notes?: Notes;
  candidateNotes?: Notes;
  noteHistory: Notes[];
  job: {
    status: "idle" | "running" | "completed" | "error" | "cancelled";
    stage: string;
    progress: string;
    error?: string;
  };
};
export type Config = {
  configured: boolean;
  transcriptionModel: string;
  notesModel: string;
  budget: { limit: number; reserved: number };
  ffmpeg: boolean;
};
export const secondsLabel = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
