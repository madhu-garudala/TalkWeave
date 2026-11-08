import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Download,
  Mic,
  Pause,
  Play,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import type { CaptureMetadata, RecordingSegment } from "../shared/types";
import { secondsLabel } from "../shared/types";
import {
  createRecording,
  deleteRecording,
  readRecording,
  saveRecording,
  type RecordingDraft,
} from "./recording-store";

type State =
  | "loading"
  | "idle"
  | "requesting"
  | "starting"
  | "recording"
  | "paused"
  | "stopping"
  | "ready";
const formats = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
];
export function Recorder({
  sessionId,
  sessionTitle,
  serverReady,
  disabled,
  onActive,
  onSave,
}: {
  sessionId: string;
  sessionTitle: string;
  serverReady: boolean;
  disabled: boolean;
  onActive: (active: boolean) => void;
  onSave: (file: File, capture: CaptureMetadata) => Promise<void>;
}) {
  const [state, setState] = useState<State>("loading");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(0);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const stateRef = useRef<State>("loading");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const draft = useRef<RecordingDraft | null>(null);
  const chunks = useRef<Blob[]>([]);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const cancelledRequest = useRef(false);
  const requestVersion = useRef(0);
  const storageFailed = useRef(false);
  const context = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const interval = useRef<{ wall: number; mono: number; media: number } | null>(
    null,
  );
  const duration = useRef(0);
  const blobUrl = useRef("");
  const supported =
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    window.isSecureContext;
  function transition(value: State) {
    stateRef.current = value;
    if (mounted.current) setState(value);
    onActive(
      ["requesting", "starting", "recording", "paused", "stopping"].includes(
        value,
      ),
    );
  }
  function warn(text: string) {
    if (mounted.current) setMessage(text);
    if (draft.current && !draft.current.warnings.includes(text))
      draft.current.warnings.push(text);
  }
  function currentSeconds() {
    return (
      duration.current +
      (interval.current
        ? (performance.now() - interval.current.mono) / 1000
        : 0)
    );
  }
  function intervalsSnapshot(): RecordingSegment[] {
    const values = draft.current?.intervals || [];
    const active = interval.current;
    if (!active) return [...values];
    const length = (performance.now() - active.mono) / 1000;
    return [
      ...values,
      {
        wallStart: new Date(active.wall).toISOString(),
        wallEnd: new Date(active.wall + length * 1000).toISOString(),
        mediaStart: active.media,
        mediaEnd: active.media + length,
      },
    ];
  }
  function snapshot(): RecordingDraft {
    return {
      ...draft.current!,
      intervals: intervalsSnapshot(),
      elapsed: currentSeconds(),
    };
  }
  function closeInterval() {
    if (!interval.current || !draft.current) return;
    draft.current.intervals = intervalsSnapshot();
    duration.current = currentSeconds();
    interval.current = null;
    draft.current.elapsed = duration.current;
  }
  function queueSave(chunk?: { index: number; blob: Blob }) {
    const value = snapshot();
    pending.current = pending.current
      .then(() => saveRecording(value, chunk))
      .then(() => {
        if (mounted.current) setSaved(value.bytes);
      })
      .catch(() => {
        storageFailed.current = true;
        warn(
          "Browser storage could not save this recording. Recording has stopped. Download the available audio now; unsaved chunks remain only in this tab.",
        );
        stop(true);
      });
  }
  function release() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
    analyser.current = null;
    if (mounted.current) setLevel(0);
  }
  function preview() {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    const blob = new Blob(chunks.current, {
      type: draft.current?.mimeType || "audio/webm",
    });
    blobUrl.current = URL.createObjectURL(blob);
    if (mounted.current) setUrl(blobUrl.current);
  }
  function stop(interrupted = false) {
    const r = recorder.current;
    if (interrupted && draft.current) draft.current.interrupted = true;
    if (!r || r.state === "inactive") return;
    closeInterval();
    transition("stopping");
    try {
      r.stop();
    } catch {
      release();
      transition("ready");
      preview();
    }
  }
  useEffect(() => {
    mounted.current = true;
    void readRecording(sessionId)
      .then((result) => {
        if (!mounted.current) return;
        if (result.draft) {
          draft.current = result.draft;
          chunks.current = result.chunks;
          duration.current = result.draft.elapsed;
          setElapsed(result.draft.elapsed);
          setSaved(result.draft.bytes);
          if (result.draft.status !== "ready") {
            draft.current.interrupted = true;
            draft.current.status = "interrupted";
            warn(
              "Recovered saved chunks after an interruption. The last unsaved audio may be missing. Preview or download before saving; timing will need review.",
            );
          }
          preview();
          transition("ready");
        } else transition("idle");
      })
      .catch(() => {
        if (mounted.current) {
          warn(
            "Browser recording storage is unavailable. Allow site storage or use another browser to record safely.",
          );
          transition("idle");
        }
      });
    const unload = (e: BeforeUnloadEvent) => {
      if (
        ["recording", "paused", "requesting", "starting", "stopping"].includes(
          stateRef.current,
        )
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const hidden = () => {
      if (document.hidden && recorder.current?.state === "recording") {
        warn(
          "Recording paused because the tab was hidden. Return to this tab and resume. Screen-lock and background recording are not supported yet.",
        );
        recorder.current.pause();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      mounted.current = false;
      cancelledRequest.current = true;
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", hidden);
      if (recorder.current?.state !== "inactive") stop(true);
      release();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, [sessionId]);
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    const timer = window.setInterval(() => {
      setElapsed(currentSeconds());
      if (stateRef.current === "recording" && analyser.current) {
        const values = new Uint8Array(analyser.current.fftSize);
        analyser.current.getByteTimeDomainData(values);
        const rms = Math.sqrt(
          values.reduce((n, v) => n + ((v - 128) / 128) ** 2, 0) /
            values.length,
        );
        setLevel(Math.min(1, rms * 6));
      } else setLevel(0);
      if (currentSeconds() >= 7199) {
        warn(
          "The two-hour recording limit was reached. Save this recording and start a new session.",
        );
        stop();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [state]);
  async function start() {
    if (!supported) return;
    setMessage("");
    cancelledRequest.current = false;
    transition("requesting");
    const version = ++requestVersion.current;
    let createdDraft = false;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (
        cancelledRequest.current ||
        !mounted.current ||
        version !== requestVersion.current
      ) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      transition("starting");
      stream.current = media;
      storageFailed.current = false;
      const mimeType = formats.find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      });
      recorder.current = r;
      chunks.current = [];
      duration.current = 0;
      setElapsed(0);
      setSaved(0);
      draft.current = {
        id: crypto.randomUUID(),
        sessionId,
        startedAt: new Date().toISOString(),
        intervals: [],
        interrupted: false,
        warnings: [],
        mimeType: r.mimeType || mimeType || "audio/webm",
        status: "recording",
        bytes: 0,
        chunkCount: 0,
        elapsed: 0,
      };
      await createRecording(draft.current);
      createdDraft = true;
      if (
        cancelledRequest.current ||
        !mounted.current ||
        version !== requestVersion.current
      ) {
        release();
        await deleteRecording(sessionId);
        return;
      }
      try {
        const ctx = new AudioContext();
        context.current = ctx;
        const source = ctx.createMediaStreamSource(media);
        const a = ctx.createAnalyser();
        a.fftSize = 256;
        source.connect(a);
        analyser.current = a;
        await ctx.resume();
      } catch {
        warn(
          "Audio is recording, but the input-level meter is unavailable in this browser.",
        );
      }
      if (
        cancelledRequest.current ||
        !mounted.current ||
        version !== requestVersion.current
      ) {
        media.getTracks().forEach((t) => t.stop());
        if (createdDraft) await deleteRecording(sessionId);
        return;
      }
      r.onstart = () => {
        const wall = Date.now();
        draft.current!.startedAt = new Date(wall).toISOString();
        interval.current = { wall, mono: performance.now(), media: 0 };
        transition("recording");
        queueSave();
      };
      r.onpause = () => {
        closeInterval();
        draft.current!.status = "paused";
        transition("paused");
        queueSave();
      };
      r.onresume = () => {
        interval.current = {
          wall: Date.now(),
          mono: performance.now(),
          media: duration.current,
        };
        draft.current!.status = "recording";
        transition("recording");
        queueSave();
      };
      r.ondataavailable = (e) => {
        if (!e.data.size || !draft.current) return;
        const index = chunks.current.length;
        chunks.current.push(e.data);
        draft.current.bytes += e.data.size;
        draft.current.chunkCount = chunks.current.length;
        queueSave({ index, blob: e.data });
        if (draft.current.bytes > 240 * 1024 * 1024) {
          warn(
            "The recording size limit was reached. Save this recording before continuing in a new session.",
          );
          stop();
        }
      };
      r.onerror = () => {
        warn(
          "The microphone recorder reported an error. Recording stopped; preview the audio that was saved.",
        );
        stop(true);
      };
      r.onstop = async () => {
        if (stateRef.current !== "stopping") {
          draft.current!.interrupted = true;
          warn(
            "Recording ended unexpectedly. Preview the recovered audio before saving; timing will need review.",
          );
        }
        closeInterval();
        release();
        draft.current!.status = draft.current!.interrupted
          ? "interrupted"
          : "ready";
        queueSave();
        await pending.current;
        if (mounted.current) {
          setElapsed(duration.current);
          transition("ready");
          preview();
        }
      };
      for (const track of media.getAudioTracks()) {
        track.onended = () => {
          if (r.state !== "inactive") {
            warn(
              "The microphone disconnected. Recording stopped; reconnect it before starting another recording.",
            );
            stop(true);
          }
        };
        track.onmute = () => {
          if (r.state === "recording") {
            warn(
              "The microphone became unavailable. Recording stopped instead of silently capturing a gap.",
            );
            stop(true);
          }
        };
      }
      r.start(1000);
    } catch (error) {
      if (version !== requestVersion.current) return;
      release();
      if (createdDraft && !chunks.current.length)
        await deleteRecording(sessionId).catch(() => {});
      recorder.current = null;
      transition("idle");
      const name = error instanceof DOMException ? error.name : "";
      warn(
        name === "NotAllowedError"
          ? "Microphone access was denied. Allow the microphone in your browser’s site settings, then try again."
          : name === "NotFoundError"
            ? "No microphone was found. Connect an input device, then try again."
            : name === "NotReadableError"
              ? "The microphone is busy or unavailable. Close other recording apps and try again."
              : "Could not start recording. Check microphone permissions and available browser storage, then try again.",
      );
    }
  }
  function file() {
    const mime = draft.current?.mimeType || "audio/webm";
    const extension = mime.includes("mp4")
      ? "m4a"
      : mime.includes("ogg")
        ? "ogg"
        : "webm";
    return new File(
      chunks.current,
      `talkweave-recording-${draft.current!.id}.${extension}`,
      { type: mime },
    );
  }
  async function save() {
    if (!draft.current || !chunks.current.length) return;
    setSaving(true);
    try {
      await pending.current;
      const { id, startedAt, intervals, interrupted, warnings } = draft.current;
      await onSave(file(), { id, startedAt, intervals, interrupted, warnings });
      await deleteRecording(sessionId);
    } catch (error) {
      warn(
        error instanceof Error
          ? error.message
          : "Could not save to the session. Your local recording is retained; reconnect and retry.",
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  async function discard() {
    if (
      !window.confirm(
        "Delete this browser recording? Download a copy first if you want to keep it.",
      )
    )
      return;
    try {
      await deleteRecording(sessionId);
      chunks.current = [];
      draft.current = null;
      duration.current = 0;
      setElapsed(0);
      setSaved(0);
      setMessage("");
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      setUrl("");
      transition("idle");
    } catch {
      warn("Could not delete browser recording storage. Please retry.");
    }
  }
  const active = state === "recording" || state === "paused";
  return (
    <section
      className={"recorder-panel recorder-" + state}
      aria-label="Device recording"
    >
      <div className="recorder-heading">
        <span className="recorder-icon">
          <Mic size={23} />
        </span>
        <div>
          <span className="eyebrow">CAPTURE IT HERE</span>
          <h2>
            {state === "ready"
              ? "Your recording is ready."
              : "Record from this device."}
          </h2>
        </div>
        <span
          className={
            "recording-status " + (state === "recording" ? "is-live" : "")
          }
          role="status"
        >
          {state === "recording"
            ? "Recording"
            : state === "paused"
              ? "Paused"
              : state === "stopping"
                ? "Saving local audio…"
                : state === "requesting"
                  ? "Waiting for microphone…"
                  : state === "starting"
                    ? "Starting microphone…"
                    : state === "ready"
                      ? storageFailed.current
                        ? "Download to keep your audio"
                        : "Saved in this browser"
                      : "Microphone audio"}
        </span>
      </div>
      {!serverReady && (
        <div className="recorder-message" role="alert">
          <AlertCircle size={17} />
          <span>
            The running server needs a restart to attach recordings. Stop it
            with Ctrl+C and run npm run dev again. Existing browser recordings
            are kept; retry Save to session after restarting.
          </span>
        </div>
      )}
      {state === "ready" && (
        <p className="muted">
          Your audio is saved in this browser. Choose{" "}
          <strong>Save to session</strong> to attach it to “{sessionTitle}”,
          then add photos and create your notebook.
        </p>
      )}
      {!supported ? (
        <div className="recorder-message">
          <AlertCircle size={17} />
          <span>
            Recording requires a supported browser on HTTPS or localhost. Open
            this app directly on this device using a secure address, or import a
            recording.
          </span>
        </div>
      ) : state === "idle" || state === "loading" ? (
        <div className="recorder-idle">
          <p>
            Use your microphone, then add slide photos and create your notebook.
            Record only where permitted. Keep this tab visible; switching apps
            or locking the screen can interrupt capture.
          </p>
          <button
            className="primary"
            disabled={disabled || !serverReady || state === "loading"}
            onClick={() => void start()}
          >
            <Mic size={17} />
            Start recording
          </button>
        </div>
      ) : state === "requesting" || state === "starting" ? (
        <div className="recorder-idle">
          <p>
            {state === "requesting"
              ? "Choose Allow in your browser’s microphone prompt."
              : "Preparing local recording storage…"}
          </p>
          {state === "requesting" && (
            <button
              className="secondary"
              onClick={() => {
                cancelledRequest.current = true;
                requestVersion.current++;
                transition("idle");
              }}
            >
              Cancel request
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="recorder-console">
            <div className="recording-clock">
              {secondsLabel(elapsed)}
              <span>
                {state === "ready"
                  ? "recorded audio"
                  : "elapsed recording time"}
              </span>
            </div>
            <div
              className="input-meter"
              aria-label="Microphone input level"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <i key={i} className={i / 24 < level ? "lit" : ""} />
              ))}
            </div>
            <div className="recording-controls">
              {active && (
                <>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (recorder.current?.state === "recording")
                        recorder.current.pause();
                      else if (recorder.current?.state === "paused")
                        recorder.current.resume();
                    }}
                  >
                    {state === "paused" ? (
                      <Play size={16} />
                    ) : (
                      <Pause size={16} />
                    )}{" "}
                    {state === "paused"
                      ? "Resume recording"
                      : "Pause recording"}
                  </button>
                  <button className="record-stop" onClick={() => stop()}>
                    <Square size={14} />
                    Stop recording
                  </button>
                </>
              )}
              {state === "ready" && (
                <button
                  className="primary"
                  disabled={saving || disabled || !chunks.current.length}
                  onClick={() => void save()}
                >
                  <Upload size={16} />
                  {saving ? "Saving to session…" : "Save to session"}
                </button>
              )}
            </div>
          </div>
          <div className="recording-storage">
            <Check size={13} />
            {(saved / 1024 / 1024).toFixed(2)} MB saved locally ·{" "}
            {draft.current?.chunkCount || 0} chunks · no cloud processing yet
          </div>
          {state === "ready" && url && (
            <div className="recording-preview">
              <audio controls src={url} preload="metadata" />
              <a
                className="text-button"
                href={url}
                download={`talkweave-recording.${draft.current?.mimeType.includes("mp4") ? "m4a" : draft.current?.mimeType.includes("ogg") ? "ogg" : "webm"}`}
              >
                <Download size={15} />
                Download audio
              </a>
              <button
                className="text-button"
                disabled={saving}
                onClick={() => void discard()}
              >
                <Trash2 size={14} />
                Discard
              </button>
            </div>
          )}
        </>
      )}
      {message && (
        <div className="recorder-message" role="alert">
          <AlertCircle size={17} />
          <span>{message}</span>
        </div>
      )}
    </section>
  );
}
