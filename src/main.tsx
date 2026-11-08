import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AudioLines,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FileAudio,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Moon,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
  Play,
  Clock3,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import type {
  Config,
  Notes,
  Photo,
  Section,
  Session,
  Transcript,
  CaptureMetadata,
} from "../shared/types";
import { secondsLabel } from "../shared/types";
import "./style.css";
import { Library, type Summary } from "./Library";
import { Recorder } from "./Recorder";
import { deleteRecording } from "./recording-store";
let csrf = "";
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch("/api" + url, {
    method,
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "X-TalkWeave-Token": csrf,
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const value = await res.json();
    throw new Error(value.error || "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
const media = (s: Session, file: string) =>
  `/api/sessions/${s.id}/media/${encodeURIComponent(file)}`;
const kindName = (kind: string) => kind.replaceAll("-", " ");
function App() {
  const [config, setConfig] = useState<Config>();
  const [list, setList] = useState<Summary[]>([]);
  const [s, setS] = useState<Session>();
  const [tab, setTab] = useState("notes");
  const [dark, setDark] = useState(
    () => localStorage.getItem("talkweave-theme") !== "light",
  );
  const [busy, setBusy] = useState("");
  const [captureActive, setCaptureActive] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);
  const [settings, setSettings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [compare, setCompare] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const playbackEnd = useRef<number | null>(null);
  const selected = useRef<string | undefined>(undefined);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("talkweave-theme", dark ? "dark" : "light");
  }, [dark]);
  async function refresh() {
    setList(await api<Summary[]>("/sessions"));
  }
  useEffect(() => {
    api<Config & { token: string }>("/config")
      .then((v) => {
        csrf = v.token;
        setConfig(v);
        return refresh();
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (s?.job.status !== "running") return;
    const id = s.id;
    const timer = setInterval(
      () =>
        api<Session>("/sessions/" + id)
          .then((value) => {
            if (selected.current === id) setS(value);
          })
          .catch((e) => setError(e.message)),
      1200,
    );
    return () => clearInterval(timer);
  }, [s?.id, s?.job.status]);
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
      await refresh();
      const c = await api<Config & { token: string }>("/config");
      csrf = c.token;
      setConfig(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }
  function show(value: Session) {
    window.scrollTo({ top: 0, behavior: "instant" });
    selected.current = value.id;
    setS(value);
    setQuery("");
    setTab(value.notes ? "notes" : "import");
  }
  const choose = (id: string) =>
    run("Opening session", async () =>
      show(await api<Session>("/sessions/" + id)),
    );
  async function update(url: string, method: string, body?: unknown) {
    const value = await api<Session>(url, method, body);
    setS(value);
  }
  const locked = !!busy || s?.job.status === "running" || captureActive;
  async function saveCapture(file: File, capture: CaptureMetadata) {
    if (!s) return;
    setBusy("Saving recording");
    try {
      // Re-read readiness and the mutation token without reloading or losing
      // the recording when a server was restarted while this tab stayed open.
      const current = await api<Config & { token: string }>("/config");
      csrf = current.token;
      setConfig(current);
      if (current.captureVersion !== 1)
        throw new Error(
          "The running server needs to be restarted to attach recordings. Stop it with Ctrl+C, run npm run dev again, then retry Save to session here. Your browser recording is retained; you can also download a backup.",
        );
      const data = new FormData();
      data.append("audio", file);
      data.append("capture", JSON.stringify(capture));
      const updated = await api<Session>(
        `/sessions/${s.id}/audio`,
        "POST",
        data,
      );
      setS(updated);
      setTab("import");
      await refresh().catch(() => {});
    } finally {
      setBusy("");
    }
  }
  function seek(start: number, end: number) {
    if (audio.current) {
      audio.current.currentTime = start;
      playbackEnd.current = end;
      void audio.current
        .play()
        .catch(() =>
          setError(
            "Playback could not start. Use the audio controls to try again.",
          ),
        );
    }
  }
  const process = (stage: string) =>
    run("Starting processing", () =>
      update(`/sessions/${s!.id}/process`, "POST", { stage }),
    );
  const matching = (text: string) =>
    !query || text.toLowerCase().includes(query.toLowerCase());
  return (
    <div className="app-shell">
      <header className="app-nav">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            if (captureActive) return;
            window.scrollTo({ top: 0, behavior: "instant" });
            selected.current = undefined;
            setS(undefined);
          }}
        >
          <span className="brand-icon">
            <AudioLines size={25} />
          </span>
          talkweave
          <span className="brand-dot" aria-hidden="true">
            ✳
          </span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={!s ? "active" : ""}
            disabled={captureActive}
            onClick={() => {
              selected.current = undefined;
              setS(undefined);
            }}
          >
            <Layers3 size={16} />
            My library
          </button>
          {s && (
            <span className="nav-current">
              <ChevronRight size={14} />
              Notebook
            </span>
          )}
        </nav>
        <div className="nav-actions">
          <span className="local-badge">
            <ShieldCheck size={14} />
            Local workspace
          </span>
          <button
            className="theme-button icon-button"
            aria-label={dark ? "Light appearance" : "Dark appearance"}
            title={dark ? "Light appearance" : "Dark appearance"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button
            className="primary nav-create"
            onClick={() => setCreate(true)}
            disabled={!config || captureActive}
          >
            <Plus size={17} />
            New session
          </button>
        </div>
      </header>
      <main className="workspace">
        {s && (
          <div className="topbar">
            <button
              className="back-link"
              disabled={captureActive}
              onClick={() => {
                selected.current = undefined;
                setS(undefined);
              }}
            >
              <ArrowLeft size={15} />
              Back to library
            </button>
            <span
              className={"connection " + (config?.configured ? "online" : "")}
            >
              <i />
              {config?.configured
                ? "OpenAI configured"
                : "Demo available · API key needed"}
            </span>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {busy && (
          <div className="busy-bar" role="status">
            <LoaderCircle className="spin" size={15} />
            {busy}…
          </div>
        )}
        {!s ? (
          <Library
            sessions={list}
            ready={!!config}
            busy={!!busy}
            onCreate={() => setCreate(true)}
            onDemo={() =>
              run("Creating demo fixture", async () =>
                show(await api<Session>("/fixture", "POST")),
              )
            }
            onOpen={choose}
          />
        ) : (
          <>
            <section className="session-heading">
              <div className="eyebrow">
                THE SESSION NOTEBOOK{" "}
                {s.mode === "fixture" && (
                  <span className="fixture-tag">DEMO FIXTURE</span>
                )}
              </div>
              <div className="title-row">
                <h1>{s.title}</h1>
                <div className="heading-actions">
                  <button
                    className="icon-button"
                    aria-label="Session settings"
                    onClick={() => setSettings(true)}
                    disabled={locked}
                  >
                    <Settings2 size={18} />
                  </button>
                  <button
                    className="primary"
                    onClick={() => setExporting(true)}
                    disabled={!s.notes || locked}
                  >
                    <Download size={16} />
                    Export
                  </button>
                </div>
              </div>
              <div className="session-meta">
                <span>{s.speaker || "Speaker not set"}</span>
                <span>·</span>
                <span>{s.event || "Personal session"}</span>
                <span>·</span>
                <span>
                  {s.audio ? secondsLabel(s.audio.duration) : "No audio"}
                </span>
                <span>·</span>
                <span>{s.photos.length} photos</span>
              </div>
            </section>
            {!s.audio && (
              <Recorder
                key={s.id}
                sessionId={s.id}
                sessionTitle={s.title}
                serverReady={config?.captureVersion === 1}
                disabled={!!busy || s.job.status === "running"}
                onActive={setCaptureActive}
                onSave={saveCapture}
              />
            )}
            {s.capture?.warnings.length ? (
              <div className="notice warning">
                <AlertCircle size={17} />
                <span>{s.capture.warnings.join(" ")}</span>
              </div>
            ) : null}
            {s.mode === "fixture" && (
              <div className="notice fixture-notice">
                <FlaskConical size={17} />
                <span>
                  Demo: authored transcript, notes, and slides. Audio is
                  silence. The first photo is deliberately misaligned; correct
                  it to 30–60 seconds.
                </span>
              </div>
            )}
            {(s.job.status === "running" || s.job.error) && (
              <div
                className={"notice " + (s.job.error ? "warning" : "")}
                role="status"
              >
                {s.job.status === "running" ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <AlertCircle size={18} />
                )}
                <span>
                  <strong>{s.job.stage}</strong> ·{" "}
                  {s.job.error || s.job.progress}
                </span>
                {s.job.status === "running" ? (
                  <button
                    className="small-button"
                    onClick={() =>
                      run("Cancelling", () =>
                        update(`/sessions/${s.id}/cancel`, "POST"),
                      )
                    }
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    className="small-button"
                    onClick={() => process("all")}
                    disabled={locked}
                  >
                    Resume pipeline
                  </button>
                )}
              </div>
            )}
            <div className="tabbar">
              <div role="tablist" aria-label="Notebook views">
                {[
                  ["notes", BookOpen, "Notes"],
                  ["transcript", AudioLines, "Transcript"],
                  ["photos", ImageIcon, "Photos & alignment"],
                  ["import", Upload, "Import"],
                ].map(([id, Icon, label]) => {
                  const C = Icon as typeof BookOpen;
                  return (
                    <button
                      key={String(id)}
                      role="tab"
                      aria-selected={tab === id}
                      className={tab === id ? "active" : ""}
                      onClick={() => setTab(String(id))}
                    >
                      <C size={16} />
                      {String(label)}
                      {id === "photos" && <span>{s.photos.length}</span>}
                    </button>
                  );
                })}
              </div>
              <label className="search">
                <Search size={16} />
                <input
                  aria-label="Search notebook"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this notebook"
                />
              </label>
            </div>
            <div className="session-content">
              {tab === "import" && (
                <div className="import-layout">
                  <div>
                    <h2>Start with what you captured.</h2>
                    <p className="muted">
                      Your original files stay intact. Processing creates
                      separate, reviewable evidence.
                    </p>
                    <div className="import-card">
                      <span className="step-number">01</span>
                      <div>
                        <h3>
                          {s.audio
                            ? "Session recording"
                            : "Or import an existing recording"}
                        </h3>
                        <p>
                          MP3, M4A, WAV, MP4, WebM, OGG, FLAC, MPEG, MPGA · up
                          to 250 MB / 2 hours
                        </p>
                        {s.audio ? (
                          <div className="file-imported" role="status">
                            <Check size={18} />
                            <span>
                              {s.audio.name}
                              <small>
                                Attached to this session ·{" "}
                                {secondsLabel(s.audio.duration)} · original
                                preserved
                              </small>
                            </span>
                          </div>
                        ) : (
                          <label
                            className={
                              "upload-zone " + (locked ? "disabled" : "")
                            }
                          >
                            <FileAudio size={30} />
                            <strong>Choose an audio recording</strong>
                            <span>Import the file from your recorder</span>
                            <input
                              aria-label="Import audio"
                              type="file"
                              accept=".mp3,.m4a,.wav,.mp4,.webm,.ogg,.flac,.mpeg,.mpga"
                              disabled={locked}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f)
                                  void run(
                                    "Importing and preparing audio",
                                    async () => {
                                      const b = new FormData();
                                      b.append("audio", f);
                                      await update(
                                        `/sessions/${s.id}/audio`,
                                        "POST",
                                        b,
                                      );
                                    },
                                  );
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="import-card">
                      <span className="step-number">02</span>
                      <div>
                        <h3>Slide & diagram photos</h3>
                        <p>
                          JPEG or PNG · up to 30 photos, 20 MB each. HEIC:
                          export as JPEG from Photos → File → Export → Export
                          Photos.
                        </p>
                        <label
                          className={
                            "upload-zone compact " + (locked ? "disabled" : "")
                          }
                        >
                          <ImageIcon size={25} />
                          <strong>Add photos from your camera</strong>
                          <span>
                            Capture metadata is retained when available
                          </span>
                          <input
                            aria-label="Import photos"
                            type="file"
                            multiple
                            accept=".jpg,.jpeg,.png,.heic,.heif"
                            disabled={locked}
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length)
                                void run("Importing photos", async () => {
                                  const errors: string[] = [];
                                  for (const f of files) {
                                    try {
                                      const b = new FormData();
                                      b.append("photo", f);
                                      await update(
                                        `/sessions/${s.id}/photos`,
                                        "POST",
                                        b,
                                      );
                                    } catch (err) {
                                      errors.push(
                                        `${f.name}: ${err instanceof Error ? err.message : "Import failed"}`,
                                      );
                                    }
                                  }
                                  if (errors.length)
                                    throw new Error(errors.join(" "));
                                });
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {s.photos.length > 0 && (
                          <p className="success-text">
                            {s.photos.length} photos safely imported.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="import-card">
                      <span className="step-number">03</span>
                      <div>
                        <h3>Anchor the timeline</h3>
                        <p>
                          {s.recordingStart
                            ? `Recording started ${s.recordingStart}`
                            : "Recording start is unknown. Set the actual time and UTC offset for metadata matching, or use manual/content matching."}
                        </p>
                        <button
                          className="secondary"
                          onClick={() => setSettings(true)}
                          disabled={locked}
                        >
                          <Clock3 size={16} />
                          Set timing & clock offset
                        </button>
                      </div>
                    </div>
                  </div>
                  <aside className="pipeline-card">
                    <span className="eyebrow">YOUR PROCESSING PATH</span>
                    <h3>
                      From raw sources
                      <br />
                      to useful notes.
                    </h3>
                    {[
                      ["Import", !!s.audio],
                      ["Timestamped transcript", s.transcriptionComplete],
                      [
                        "Photo observations",
                        s.photos.length > 0 &&
                          s.photos.every((p) => p.analysis),
                      ],
                      ["Source-linked notes", !!s.notes],
                    ].map(([label, done], i) => (
                      <div className="pipeline-step" key={String(label)}>
                        <span className={done ? "done" : ""}>
                          {done ? <Check size={14} /> : i + 1}
                        </span>
                        {label}
                      </div>
                    ))}
                    <button
                      className="primary"
                      disabled={
                        locked ||
                        !s.audio ||
                        (!s.notes && !config?.configured) ||
                        (!s.notes && s.mode === "fixture")
                      }
                      onClick={() =>
                        s.notes ? setTab("notes") : process("all")
                      }
                    >
                      {s.notes
                        ? "Open notebook"
                        : s.job.status === "error"
                          ? "Resume processing"
                          : "Create my notebook"}
                      <ArrowUpRight size={16} />
                    </button>
                    <small>
                      {s.notes
                        ? "Your notebook is ready. Open it to review the notes and their sources."
                        : config?.configured
                          ? "Sends audio and display photos to OpenAI."
                          : "Add OPENAI_API_KEY to .env, then restart the server."}
                    </small>
                    <p>
                      Reserved test allowance: $
                      {config?.budget.reserved.toFixed(2)} / $
                      {config?.budget.limit}. This is a conservative local
                      allowance, not your billed usage.
                    </p>
                    {config && !config.ffmpeg && (
                      <p className="error-text">
                        Install ffmpeg and ffprobe to import audio.
                      </p>
                    )}
                  </aside>
                </div>
              )}
              {tab === "notes" &&
                (!s.notes ? (
                  <Empty
                    icon={<BookOpen size={30} />}
                    title="The talk is just the beginning."
                    text="Import your recording and photos, then create a source-linked notebook."
                    action={
                      <button
                        className="primary"
                        onClick={() => setTab("import")}
                      >
                        Go to import
                        <ChevronRight size={16} />
                      </button>
                    }
                  />
                ) : (
                  <div className="notes-layout">
                    <nav className="outline">
                      <span className="eyebrow">IN THIS NOTEBOOK</span>
                      {s.notes.sections.map((section, i) => (
                        <a key={section.id} href={"#" + section.id}>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          {section.title}
                        </a>
                      ))}
                      <div className="outline-footer">
                        <ShieldCheck size={17} />
                        <span>
                          Every generated claim links back to its sources.
                        </span>
                      </div>
                      <button
                        className="small-button"
                        disabled={
                          locked || s.mode === "fixture" || !!s.candidateNotes
                        }
                        onClick={() => process("notes")}
                      >
                        Generate a new draft
                      </button>
                      <small>Current edits are preserved.</small>
                    </nav>
                    <article className="notes-document">
                      {s.notes.inputRevision !== s.evidenceRevision && (
                        <div className="notice warning">
                          <AlertCircle size={17} />
                          <span>
                            Sources or timing have changed. Review these notes
                            or generate a new draft.
                          </span>
                        </div>
                      )}
                      {s.candidateNotes && (
                        <div className="notice">
                          <FileText size={18} />
                          <span>
                            A new draft is ready. Existing edits remain in the
                            current version.
                          </span>
                          <button
                            className="small-button"
                            onClick={() => setCompare(true)}
                          >
                            Compare drafts
                          </button>
                        </div>
                      )}
                      <div className="document-kicker">
                        <span className="document-icon">
                          <BookOpen size={20} />
                        </span>{" "}
                        THE NOTEBOOK{" "}
                        <span>
                          {s.notes.sections.length} sections · source linked
                        </span>
                      </div>
                      {s.notes.sections
                        .filter((section) =>
                          matching(
                            [
                              section.title,
                              ...section.claims.map((c) => c.text),
                              section.userNote,
                            ].join(" "),
                          ),
                        )
                        .map((section, i) => (
                          <NoteSection
                            key={section.id}
                            section={section}
                            index={i}
                            s={s}
                            locked={locked}
                            seek={seek}
                            onPhoto={() => setTab("photos")}
                            onSave={(patch) =>
                              run("Saving notes", () =>
                                update(
                                  `/sessions/${s.id}/notes/${section.id}`,
                                  "PATCH",
                                  patch,
                                ),
                              )
                            }
                          />
                        ))}
                      {query &&
                        !s.notes.sections.some((section) =>
                          matching(JSON.stringify(section)),
                        ) && <p>No note sections match “{query}”.</p>}
                      <div className="document-end">
                        <span>✦</span> The idea, with its context intact.
                      </div>
                    </article>
                    <aside className="evidence-rail">
                      <div className="rail-heading">
                        <span className="eyebrow">THE SOURCE MATERIAL</span>
                        <span>{s.photos.length}</span>
                      </div>
                      <h3>
                        Every picture.
                        <br />
                        In context.
                      </h3>
                      {s.photos.length ? (
                        s.photos.map((p, i) => (
                          <button
                            className="evidence-thumb"
                            key={p.id}
                            onClick={() => setTab("photos")}
                            aria-label={`Review source photo ${i + 1}`}
                          >
                            <img
                              src={media(s, p.display)}
                              alt={p.analysis?.description || p.name}
                            />
                            <span>
                              <b>PHOTO {String(i + 1).padStart(2, "0")}</b>
                              <ArrowUpRight size={14} />
                            </span>
                            <small>
                              {p.alignment.status === "unmatched"
                                ? "Not yet aligned"
                                : `${secondsLabel(p.alignment.start)} – ${secondsLabel(p.alignment.end)}`}
                            </small>
                          </button>
                        ))
                      ) : (
                        <p className="muted">
                          Add photos in Import to keep the visual context
                          alongside the words.
                        </p>
                      )}
                      <button
                        className="rail-transcript"
                        onClick={() => setTab("transcript")}
                      >
                        <AudioLines size={20} />
                        <span>
                          Return to the words
                          <small>
                            {s.transcript.length} transcript windows
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                      <div className="rail-tip">
                        <ShieldCheck size={18} />
                        <p>
                          Follow any timestamp to hear the original explanation.
                        </p>
                      </div>
                    </aside>
                  </div>
                ))}
              {tab === "transcript" && (
                <>
                  <div className="view-heading">
                    <div>
                      <h2>Go back to the words.</h2>
                      <p className="muted">
                        Source windows are at most 30 seconds. Correct technical
                        terms or mark [inaudible]; originals remain available.
                      </p>
                    </div>
                    <span className="pill">
                      {s.transcript.length} source windows
                    </span>
                  </div>
                  {!s.transcript.length ? (
                    <Empty
                      icon={<AudioLines size={30} />}
                      title="The transcript will live here."
                      text="Process your recording from the Import tab."
                    />
                  ) : (
                    s.transcript
                      .filter((t) => matching(t.text))
                      .map((t) => (
                        <TranscriptRow
                          key={t.id}
                          t={t}
                          locked={locked}
                          play={() => seek(t.start, t.end)}
                          onSave={(text) =>
                            run("Saving transcript correction", () =>
                              update(
                                `/sessions/${s.id}/transcript/${t.id}`,
                                "PATCH",
                                { text },
                              ),
                            )
                          }
                        />
                      ))
                  )}
                </>
              )}
              {tab === "photos" && (
                <>
                  <div className="view-heading">
                    <div>
                      <h2>A picture, in context.</h2>
                      <p className="muted">
                        Review suggested intervals. Manual matches survive
                        regeneration and clock corrections.
                      </p>
                    </div>
                    <button
                      className="secondary"
                      disabled={locked}
                      onClick={() => setSettings(true)}
                    >
                      <Settings2 size={16} />
                      Timing settings
                    </button>
                  </div>
                  {!s.photos.length ? (
                    <Empty
                      icon={<ImageIcon size={30} />}
                      title="Bring the diagrams along."
                      text="Add ordinary camera photos from the Import tab."
                    />
                  ) : (
                    <div className="photo-list">
                      {s.photos
                        .filter((p) =>
                          matching(
                            [
                              p.name,
                              p.analysis?.text,
                              p.analysis?.description,
                            ].join(" "),
                          ),
                        )
                        .map((p, i) => (
                          <PhotoCard
                            key={p.id}
                            p={p}
                            index={i}
                            s={s}
                            locked={locked}
                            play={seek}
                            onSave={(patch) =>
                              run("Saving photo alignment", () =>
                                update(
                                  `/sessions/${s.id}/photos/${p.id}`,
                                  "PATCH",
                                  patch,
                                ),
                              )
                            }
                          />
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {s.audio && (
              <div className="audio-dock">
                <span className="audio-icon">
                  <AudioLines size={20} />
                </span>
                <div className="audio-label">
                  <strong>
                    {s.mode === "fixture"
                      ? "Demo audio · silence"
                      : "Source recording"}
                  </strong>
                  <small>{s.audio.name}</small>
                </div>
                <audio
                  ref={audio}
                  src={media(s, s.audio.playback)}
                  controls
                  preload="metadata"
                  onTimeUpdate={() => {
                    if (
                      audio.current &&
                      playbackEnd.current !== null &&
                      audio.current.currentTime >= playbackEnd.current
                    ) {
                      audio.current.pause();
                      playbackEnd.current = null;
                    }
                  }}
                  onSeeking={() => {
                    if (
                      audio.current &&
                      playbackEnd.current !== null &&
                      audio.current.currentTime > playbackEnd.current
                    )
                      playbackEnd.current = null;
                  }}
                />
                <span className="audio-duration">
                  {secondsLabel(s.audio.duration)}
                </span>
              </div>
            )}
          </>
        )}
      </main>
      {create && (
        <Modal title="Make room for a new idea." close={() => setCreate(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run("Creating session", async () => {
                show(
                  await api<Session>("/sessions", "POST", {
                    title: f.get("title"),
                  }),
                );
                setCreate(false);
              });
            }}
          >
            <label>
              Talk title
              <input
                name="title"
                autoFocus
                placeholder="e.g. Designing reliable distributed systems"
                required
                maxLength={200}
              />
            </label>
            <p className="muted">
              Add your audio and photos next. Nothing is sent to OpenAI until
              you start processing.
            </p>
            <button className="primary" disabled={!!busy}>
              Create session
              <ArrowUpRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {settings && s && (
        <Modal title="Session & timing" close={() => setSettings(false)} wide>
          <TimingForm
            s={s}
            locked={locked}
            save={(patch) =>
              run("Saving session timing", async () => {
                await update(`/sessions/${s.id}`, "PATCH", patch);
                setSettings(false);
              })
            }
          />
          <div className="danger-zone">
            <p>
              Delete originals, derived media, transcripts, notes, and active
              jobs from this computer. Downloaded exports and provider retention
              are outside this deletion.
            </p>
            <button
              className="danger"
              disabled={locked}
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 size={15} />
              Delete session
            </button>
          </div>
        </Modal>
      )}
      {deleteConfirm && s && (
        <Modal
          title="Delete this session?"
          close={() => setDeleteConfirm(false)}
        >
          <p>This permanently removes managed local files for “{s.title}”.</p>
          <button
            className="danger"
            disabled={!!busy}
            onClick={() =>
              run("Deleting session", async () => {
                await api(`/sessions/${s.id}`, "DELETE");
                await deleteRecording(s.id).catch(() =>
                  setError(
                    "Session deleted, but browser recording storage could not be cleared. Clear this site’s browser data to remove remaining local chunks.",
                  ),
                );
                selected.current = undefined;
                setS(undefined);
                setSettings(false);
                setDeleteConfirm(false);
              })
            }
          >
            Delete local session
          </button>
        </Modal>
      )}
      {exporting && s && (
        <Modal
          title="Take your notes with you."
          close={() => setExporting(false)}
        >
          <p className="muted">
            Readable without a login, internet connection, or TalkWeave server.
            Display images are embedded with GPS metadata removed.
          </p>
          <a
            className="export-choice"
            href={`/api/sessions/${s.id}/export.html`}
            download
          >
            <FileText size={23} />
            <div>
              <strong>Portable HTML</strong>
              <span>
                Illustrated notes, source links, and transcript. Audio excluded.
              </span>
            </div>
            <Download size={18} />
          </a>
          <a
            className="export-choice"
            href={`/api/sessions/${s.id}/manifest.json`}
            download
          >
            <Layers3 size={23} />
            <div>
              <strong>Source manifest</strong>
              <span>Machine-readable evidence, revisions, and alignment.</span>
            </div>
            <Download size={18} />
          </a>
          {
            <a
              className="export-choice"
              href={`/api/sessions/${s.id}/bundle.zip`}
              download
            >
              <FileAudio size={23} />
              <div>
                <strong>Evidence bundle</strong>
                <span>
                  {s.mode === "fixture"
                    ? "HTML + manifest + silent demo WAV."
                    : "HTML + manifest + audio MP3."}{" "}
                  Extract ZIP before opening index.html.
                </span>
              </div>
              <Download size={18} />
            </a>
          }
          <small>
            Original photos are excluded. The bundle contains a normalized audio
            derivative. Review the document before sharing.
          </small>
        </Modal>
      )}
      {compare && s?.candidateNotes && (
        <Modal
          title="Review the new draft"
          wide
          close={() => setCompare(false)}
        >
          <p>
            Accepting replaces the current notes and their inline edits. The
            previous version is retained in local revision history. Keep this
            draft only after comparing it.
          </p>
          <div className="compare">
            <Draft title="Current notes" notes={s.notes!} />
            <Draft title="Proposed draft" notes={s.candidateNotes} />
          </div>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() =>
                run("Keeping current notes", async () => {
                  await update(`/sessions/${s.id}/candidate`, "POST", {
                    accept: false,
                  });
                  setCompare(false);
                })
              }
            >
              Keep current notes
            </button>
            <button
              className="primary"
              onClick={() =>
                run("Accepting new draft", async () => {
                  await update(`/sessions/${s.id}/candidate`, "POST", {
                    accept: true,
                  });
                  setCompare(false);
                })
              }
            >
              Replace with reviewed draft
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={wide ? "wide" : ""}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Draft({ title, notes }: { title: string; notes: Notes }) {
  return (
    <div>
      <h3>{title}</h3>
      {notes.sections.map((s) => (
        <section key={s.id}>
          <h4>{s.title}</h4>
          {s.claims.map((c, i) => (
            <p key={i}>
              <small>
                {kindName(c.kind)} · {c.transcriptIds.join(", ")}{" "}
                {c.photoIds.join(", ")}
              </small>
              <br />
              {c.text}
            </p>
          ))}
          {s.userNote && <p>User note: {s.userNote}</p>}
        </section>
      ))}
    </div>
  );
}
function NoteSection({
  section,
  index,
  s,
  locked,
  seek,
  onPhoto,
  onSave,
}: {
  section: Section;
  index: number;
  s: Session;
  locked: boolean;
  seek: (start: number, end: number) => void;
  onPhoto: () => void;
  onSave: (patch: unknown) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(section);
  useEffect(() => {
    setDraft(section);
  }, [section]);
  return (
    <section className="note-section" id={section.id}>
      <div className="note-section-heading">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <h2>{section.title}</h2>
        <button
          className="text-button"
          disabled={locked}
          onClick={() => {
            setDraft(section);
            setEdit(!edit);
          }}
        >
          {edit ? "Cancel" : "Edit"}
        </button>
      </div>
      {edit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              title: draft.title,
              claims: draft.claims,
              userNote: draft.userNote,
            });
            setEdit(false);
          }}
        >
          <label>
            Section title
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              required
            />
          </label>
          {draft.claims.map((c, i) => (
            <label key={i}>
              {kindName(c.kind)} · existing sources retained
              <textarea
                value={c.text}
                rows={5}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    claims: draft.claims.map((old, j) =>
                      j === i ? { ...old, text: e.target.value } : old,
                    ),
                  })
                }
                required
              />
            </label>
          ))}
          <label>
            Your personal note
            <textarea
              value={draft.userNote}
              rows={3}
              onChange={(e) => setDraft({ ...draft, userNote: e.target.value })}
            />
          </label>
          <button className="primary" disabled={locked}>
            Save edits
          </button>
        </form>
      ) : (
        <>
          {section.claims.map((c, i) => (
            <div className="claim" key={i}>
              <span className={"claim-label " + c.kind}>
                {kindName(c.kind)}
              </span>
              <p>{c.text}</p>
              <div className="source-chips">
                {c.transcriptIds.map((id) => {
                  const t = s.transcript.find((t) => t.id === id);
                  return (
                    t && (
                      <button
                        key={id}
                        onClick={() => seek(t.start, t.end)}
                        title="Play this evidence interval"
                      >
                        <Play size={11} />
                        {secondsLabel(t.start)}–{secondsLabel(t.end)}
                      </button>
                    )
                  );
                })}
                {c.photoIds.map((id) => (
                  <button key={id} onClick={onPhoto}>
                    <ImageIcon size={12} />
                    Photo {s.photos.findIndex((p) => p.id === id) + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {[...new Set(section.claims.flatMap((c) => c.photoIds))].map((id) => {
            const p = s.photos.find((p) => p.id === id);
            return (
              p && (
                <figure key={id} className="note-photo">
                  <button onClick={onPhoto} aria-label={`Review ${p.name}`}>
                    <img
                      src={media(s, p.display)}
                      alt={p.analysis?.description || p.name}
                    />
                  </button>
                  <figcaption>
                    <ImageIcon size={13} />
                    {p.name}
                    <span>Original preserved</span>
                  </figcaption>
                </figure>
              )
            );
          })}
          {section.userNote && (
            <aside className="user-note">
              <span className="eyebrow">YOUR NOTE</span>
              <p>{section.userNote}</p>
            </aside>
          )}
          {section.edited && (
            <small className="muted">
              Edited by attendee · source support needs human review
            </small>
          )}
        </>
      )}
    </section>
  );
}
function TranscriptRow({
  t,
  locked,
  play,
  onSave,
}: {
  t: Transcript;
  locked: boolean;
  play: () => void;
  onSave: (text: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(t.text);
  return (
    <div className="transcript-row" id={t.id}>
      <button className="timestamp" onClick={play}>
        <Play size={13} />
        {secondsLabel(t.start)}
        <small>{secondsLabel(t.end)}</small>
      </button>
      <div>
        {edit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave(text);
              setEdit(false);
            }}
          >
            <textarea
              aria-label="Transcript correction"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              required
            />
            <div className="button-row">
              <button className="small-button" disabled={locked}>
                Save correction
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setEdit(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p>{t.text}</p>
        )}
        <small>
          {t.timing === "window"
            ? "30-second source window (last window may be shorter)"
            : "Model segment timing"}
          {t.edited ? " · attendee corrected" : ""}
        </small>
        {t.edited && (
          <details>
            <summary>Original & correction history</summary>
            <p>{t.rawText}</p>
            {t.revisions.map((r, i) => (
              <p key={i}>
                {r.at}: {r.text}
              </p>
            ))}
          </details>
        )}
      </div>
      <button
        className="text-button"
        disabled={locked}
        onClick={() => {
          setText(t.text);
          setEdit(!edit);
        }}
      >
        Edit
      </button>
    </div>
  );
}
function PhotoCard({
  p,
  index,
  s,
  locked,
  play,
  onSave,
}: {
  p: Photo;
  index: number;
  s: Session;
  locked: boolean;
  play: (start: number, end: number) => void;
  onSave: (patch: unknown) => void;
}) {
  const [start, setStart] = useState(String(p.alignment.start));
  const [end, setEnd] = useState(String(p.alignment.end));
  useEffect(() => {
    setStart(String(p.alignment.start));
    setEnd(String(p.alignment.end));
  }, [p.alignment]);
  return (
    <article className="photo-card">
      <div className="photo-preview">
        <a
          href={media(s, p.original)}
          target="_blank"
          rel="noreferrer"
          title="Open original photo"
        >
          <img
            src={media(s, p.display)}
            alt={p.analysis?.description || p.name}
          />
        </a>
        <span>PHOTO {String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="photo-details">
        <div className="photo-title">
          <h3>{p.name}</h3>
          <span className={"status " + p.alignment.status}>
            {p.alignment.status.replace("-", " ")}
          </span>
        </div>
        <p>
          {p.analysis?.description ||
            "Process this photo to extract slide text and visual observations."}
        </p>
        <div className="alignment-reason">
          <Clock3 size={15} />
          {p.alignment.reason}
        </div>
        <small>
          Original capture:{" "}
          {p.captureTime
            ? `${p.captureTime} ${p.captureOffset || "(timezone missing)"}`
            : "No capture metadata"}{" "}
          · {p.alignment.manual ? "Manual override saved" : "Suggested match"}
        </small>
        <form
          className="alignment-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ start: Number(start), end: Number(end) });
          }}
        >
          <label>
            Start (seconds)
            <input
              aria-label={`Photo ${index + 1} start`}
              type="number"
              step="0.1"
              min="0"
              max={s.audio?.duration}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
              disabled={locked}
            />
          </label>
          <span>→</span>
          <label>
            End (seconds)
            <input
              aria-label={`Photo ${index + 1} end`}
              type="number"
              step="0.1"
              min="0"
              max={s.audio?.duration}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
              disabled={locked}
            />
          </label>
          <button className="primary" disabled={locked || !s.audio}>
            Save match
          </button>
        </form>
        <div className="button-row">
          <button
            className="text-button"
            onClick={() => play(Number(start), Number(end))}
            disabled={!s.audio || Number(end) <= Number(start)}
          >
            <Play size={13} />
            Listen to interval
          </button>
          <button
            className="text-button"
            disabled={locked}
            onClick={() => onSave({ start: 0, end: 0, unmatched: true })}
          >
            Mark unmatched
          </button>
          {p.alignment.manual && (
            <button
              className="text-button"
              disabled={locked}
              onClick={() => onSave({ start: 0, end: 0, reset: true })}
            >
              Reset suggestion
            </button>
          )}
        </div>
        {p.analysis && (
          <details>
            <summary>Extracted slide text & uncertainties</summary>
            <p>{p.analysis.text}</p>
            {p.analysis.uncertainties.map((u, i) => (
              <p className="warning-text" key={i}>
                Uncertain: {u}
              </p>
            ))}
          </details>
        )}
      </div>
    </article>
  );
}
function TimingForm({
  s,
  locked,
  save,
}: {
  s: Session;
  locked: boolean;
  save: (patch: unknown) => void;
}) {
  const [advanced, setAdvanced] = useState(s.recordingSegments.length > 1);
  const [segments, setSegments] = useState(
    JSON.stringify(s.recordingSegments, null, 2),
  );
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const recordingStart = String(f.get("recordingStart")).trim();
          const patch = {
            title: f.get("title"),
            speaker: f.get("speaker"),
            event: f.get("event"),
            recordingStart: recordingStart || null,
            photoTimezone: f.get("photoTimezone"),
            deviceOffset: Number(f.get("deviceOffset")),
            ...(advanced ? { recordingSegments: JSON.parse(segments) } : {}),
          };
          if (recordingStart && !/(Z|[+-]\d{2}:\d{2})$/.test(recordingStart))
            throw new Error("Include a UTC offset, for example -05:00 or Z.");
          save(patch);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Invalid intervals");
        }
      }}
    >
      <label>
        Title
        <input name="title" defaultValue={s.title} required maxLength={200} />
      </label>
      <div className="form-grid">
        <label>
          Speaker (optional)
          <input name="speaker" defaultValue={s.speaker} />
        </label>
        <label>
          Event (optional)
          <input name="event" defaultValue={s.event} />
        </label>
      </div>
      <label>
        Actual recording start, including UTC offset
        <input
          name="recordingStart"
          defaultValue={s.recordingStart || ""}
          placeholder="2026-11-07T18:00:00-05:00"
        />
        <small>
          Leave blank if unknown. Upload or file modification times are never
          used as capture times.
        </small>
      </label>
      <div className="form-grid">
        <label>
          Photo timezone assumption
          <select name="photoTimezone" defaultValue={s.photoTimezone}>
            <option value="">Unknown — manual matching</option>
            {Array.from({ length: 57 }, (_, i) => {
              const n = (i - 28) * 15;
              const h = Math.floor(Math.abs(n) / 60);
              const m = Math.abs(n) % 60;
              const offset =
                (n < 0 ? "-" : "+") +
                String(h).padStart(2, "0") +
                ":" +
                String(m).padStart(2, "0");
              return (
                <option key={i} value={offset}>
                  UTC{offset}
                </option>
              );
            })}
            {[
              "-12:00",
              "-11:00",
              "-10:00",
              "-09:00",
              "-08:00",
              "+08:00",
              "+09:00",
              "+10:00",
              "+11:00",
              "+12:00",
              "+13:00",
              "+14:00",
            ].map((v) => (
              <option key={v} value={v}>
                UTC{v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Device clock correction (seconds)
          <input
            name="deviceOffset"
            type="number"
            min="-86400"
            max="86400"
            defaultValue={s.deviceOffset}
          />
        </label>
      </div>
      <p className="muted">
        Correction is added to the photo time. If the phone is 3 minutes fast,
        use −180. Original metadata is never changed.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => setAdvanced(e.target.checked)}
        />
        This recording has pauses or stitched intervals
      </label>
      {advanced && (
        <label>
          Recording intervals (JSON)
          <textarea
            rows={9}
            value={segments}
            onChange={(e) => setSegments(e.target.value)}
          />
          <small>
            Each interval: wallStart/wallEnd with UTC offsets,
            mediaStart/mediaEnd in seconds. Equal wall and media lengths; gaps
            between intervals are pauses. Saving without this option creates one
            continuous interval.
          </small>
        </label>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="primary" disabled={locked}>
        Save session & timing
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
