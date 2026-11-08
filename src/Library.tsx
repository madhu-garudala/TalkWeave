import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  Clock3,
  FileText,
  FlaskConical,
  Image,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
export type Summary = {
  id: string;
  title: string;
  speaker: string;
  event: string;
  createdAt: string;
  mode: string;
  photoCount: number;
  duration?: number;
  status: string;
};
export function Library({
  sessions,
  ready,
  busy,
  onCreate,
  onDemo,
  onOpen,
}: {
  sessions: Summary[];
  ready: boolean;
  busy: boolean;
  onCreate: () => void;
  onDemo: () => void;
  onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = sessions.filter(
    (s) =>
      (filter === "all" ||
        (filter === "talks" ? s.mode !== "fixture" : s.mode === "fixture")) &&
      [s.title, s.speaker, s.event]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const real = sessions.filter((s) => s.mode !== "fixture");
  return (
    <div className="library">
      <div className="library-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-dot" />
            YOUR PERSONAL KNOWLEDGE SPACE
          </div>
          <h1>
            Your library<span className="title-period">.</span>
          </h1>
          <p>The talks you heard. The ideas you kept.</p>
        </div>
        <div className="library-totals">
          <div>
            <strong>{real.length.toString().padStart(2, "0")}</strong>
            <span>your talks</span>
          </div>
          <div>
            <strong>
              {Math.round(real.reduce((n, s) => n + (s.duration || 0), 0) / 60)}
            </strong>
            <span>minutes captured</span>
          </div>
          <div>
            <strong>
              {real
                .reduce((n, s) => n + s.photoCount, 0)
                .toString()
                .padStart(2, "0")}
            </strong>
            <span>source photos</span>
          </div>
        </div>
      </div>
      <div className="library-intro-grid">
        <section className="welcome-card">
          <div className="welcome-copy">
            <span className="eyebrow">A NOTEBOOK THAT REMEMBERS</span>
            <h2>
              Stay in the moment.
              <br />
              <em>Keep the whole idea.</em>
            </h2>
            <p>
              Record here or bring your audio and photos.
              <br />
              Leave with a notebook you can actually use.
            </p>
            <button
              className="primary"
              disabled={!ready || busy}
              onClick={onCreate}
            >
              <Plus size={18} />
              Record or import
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="source-composition" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="source-tile source-audio">
              <span>
                <AudioLines size={16} />
                THE WORDS
              </span>
              <div className="wave">
                {Array.from({ length: 29 }, (_, i) => (
                  <i
                    key={i}
                    style={{ height: 8 + Math.abs(Math.sin(i * 1.31)) * 28 }}
                  />
                ))}
              </div>
            </div>
            <div className="source-tile source-image">
              <span>
                <Image size={16} />
                THE PICTURE
              </span>
              <div className="abstract-diagram">
                <i />
                <b />
                <i />
                <b />
                <i />
              </div>
            </div>
            <div className="source-tile source-notes">
              <div className="source-notes-icon">
                <BookOpen size={22} />
              </div>
              <strong>The whole story.</strong>
              <span>
                <Check size={12} />
                Every idea, linked to its source
              </span>
            </div>
            <span className="composition-mark">✳</span>
          </div>
        </section>
        <section className="demo-card">
          <span className="demo-card-icon">
            <FlaskConical size={22} />
          </span>
          <span className="eyebrow">TAKE A LOOK AROUND</span>
          <h3>
            See the connections
            <br />
            for yourself.
          </h3>
          <p>
            Explore a sample notebook with diagrams, editable notes, and linked
            evidence.
          </p>
          <button
            className="text-button"
            disabled={busy || !ready}
            onClick={onDemo}
          >
            Explore the demo notebook
            <ArrowRight size={17} />
          </button>
          <div className="demo-disclosure">
            Authored fixture · silent audio
            <br />
            No API calls or credits used
          </div>
        </section>
      </div>
      <section className="collection" aria-label="Session library">
        <div className="collection-toolbar">
          <div className="collection-heading">
            <h2>
              All notebooks <span>{sessions.length}</span>
            </h2>
            <div className="library-filters" aria-label="Filter library">
              {[
                ["all", "All sessions"],
                ["talks", "My talks"],
                ["demos", "Demos"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  className={filter === id ? "active" : ""}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="library-search">
            <Search size={17} />
            <input
              aria-label="Search sessions"
              placeholder="Find a talk, speaker, or event…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                aria-label="Clear session search"
                onClick={() => setSearch("")}
              >
                <X size={15} />
              </button>
            )}
          </label>
        </div>
        {visible.length ? (
          <div className="library-grid">
            {visible.map((item, i) => (
              <button
                className="library-card"
                key={item.id}
                onClick={() => onOpen(item.id)}
                disabled={busy}
              >
                <div
                  className={"notebook-cover cover-" + (i % 3)}
                  aria-hidden="true"
                >
                  <span className="cover-index">
                    TW / {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="cover-drawing">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="cover-type">
                    {item.mode === "fixture"
                      ? "THE DEMO COLLECTION"
                      : "THE TALK COLLECTION"}
                  </span>
                  <span className="cover-arrow">
                    <ArrowUpRight size={19} />
                  </span>
                </div>
                <div className="notebook-info">
                  <div className="notebook-meta">
                    <span>
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span
                      className={
                        "pill " +
                        (item.mode === "fixture" ? "" : "pill-" + item.status)
                      }
                    >
                      {item.mode === "fixture"
                        ? "Demo fixture"
                        : item.status === "completed"
                          ? "Processed"
                          : item.status === "running"
                            ? "Processing"
                            : item.status === "error"
                              ? "Needs attention"
                              : "In progress"}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>
                    {[item.speaker, item.event].filter(Boolean).join(" · ") ||
                      "Your personal notebook"}
                  </p>
                  <footer>
                    <span>
                      <Clock3 size={14} />
                      {item.duration
                        ? `${Math.ceil(item.duration / 60)} min`
                        : "Add audio"}
                    </span>
                    <span>
                      <Image size={14} />
                      {item.photoCount} photos
                    </span>
                    <BookOpen size={16} />
                  </footer>
                </div>
              </button>
            ))}
            <button
              className="add-notebook-card"
              onClick={onCreate}
              disabled={!ready || busy}
            >
              <span>
                <Plus size={26} />
              </span>
              <h3>Make space for the next idea.</h3>
              <p>Import another talk</p>
            </button>
          </div>
        ) : (
          <div className="empty-library">
            <span className="empty-library-icon">
              <BookOpen size={28} />
            </span>
            <h3>
              {sessions.length
                ? "Nothing here just yet."
                : "Your next great idea starts here."}
            </h3>
            <p>
              {sessions.length
                ? "Try another search or switch your library filter."
                : "Create a notebook from a talk, or explore the demo to get a feel for it."}
            </p>
            {sessions.length ? (
              <button
                className="secondary"
                onClick={() => {
                  setFilter("all");
                  setSearch("");
                }}
              >
                Reset filters
              </button>
            ) : (
              <button
                className="secondary"
                onClick={onCreate}
                disabled={!ready}
              >
                Create your first notebook
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}
      </section>
      <footer className="library-footer">
        <span>
          <ShieldCheck size={15} />
          Your sources stay on this computer.
        </span>
        <span>Cloud processing uses OpenAI. Upload only where permitted.</span>
      </footer>
    </div>
  );
}
