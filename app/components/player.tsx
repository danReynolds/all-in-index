"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { mmss } from "@/lib/format";
import type { EpisodeMeta } from "@/lib/types";

export interface QuoteTrack {
  audioUrl: string;
  /** Episode title, shown in the bar. */
  title: string;
  episodeId: string;
  episodeNumber: number | null;
  /** External episode page, offered as an ↗ in the bar. */
  link: string | null;
  /** Quote start; null plays from the top. */
  startMs: number | null;
  /** e.g. "Chamath on Robinhood" — leads the bar's text line. */
  caption?: string;
}

const PlayerContext = createContext<{ play: (t: QuoteTrack) => void } | null>(null);

/**
 * Site-wide mini player. One shared <audio> element streams the episode MP3
 * straight from the official feed's CDN (range requests make the seek cheap) —
 * nothing is copied or re-hosted, and every quote stays one click from its
 * source audio.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<QuoteTrack | null>(null);
  // Bumped on every play() so re-clicking the same quote re-seeks.
  const [nonce, setNonce] = useState(0);
  const play = useCallback((t: QuoteTrack) => {
    setTrack(t);
    setNonce((n) => n + 1);
  }, []);

  return (
    <PlayerContext.Provider value={{ play }}>
      {children}
      {track && <div aria-hidden className="h-16" />}
      {track && (
        <PlayerBar
          key={track.episodeId}
          track={track}
          nonce={nonce}
          onClose={() => setTrack(null)}
        />
      )}
    </PlayerContext.Provider>
  );
}

/** Lead-in so the quote lands with a breath of context. */
const PRE_ROLL_SEC = 4;

function PlayerBar({
  track,
  nonce,
  onClose,
}: {
  track: QuoteTrack;
  nonce: number;
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const startSec = Math.max(0, (track.startMs ?? 0) / 1000 - (track.startMs != null ? PRE_ROLL_SEC : 0));

  // Seek to the quote and play — on mount and again on every play() call.
  // currentTime is only settable once metadata is in.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const go = () => {
      try {
        a.currentTime = startSec;
      } catch {}
      a.play().catch(() => {});
    };
    if (a.readyState >= 1) go();
    else a.addEventListener("loadedmetadata", go, { once: true });
    return () => a.removeEventListener("loadedmetadata", go);
  }, [nonce, startSec]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seekToFraction = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * duration;
  };

  return (
    <div className="pop-in fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-neutral-950/90 backdrop-blur-md">
      <audio
        ref={audioRef}
        src={track.audioUrl}
        preload="metadata"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[13px] text-white transition-colors hover:bg-emerald-400"
        >
          {playing ? "❚❚" : "▶"}
        </button>

        {track.startMs != null && (
          <button
            type="button"
            onClick={() => {
              const a = audioRef.current;
              if (!a) return;
              a.currentTime = startSec;
              a.play().catch(() => {});
            }}
            title="Jump back to the quote"
            className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-neutral-300 transition-colors hover:border-white/30 hover:text-white"
          >
            ↩ {mmss(track.startMs)}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-xs">
            {track.caption && (
              <span className="font-medium text-neutral-200">{track.caption}</span>
            )}
            <span className="text-neutral-500">
              {track.caption ? " · " : ""}
              {track.episodeNumber ? `E${track.episodeNumber} · ` : ""}
              {track.title}
            </span>
          </div>
          <div
            className="mt-1.5 h-1 cursor-pointer rounded-full bg-white/10"
            onClick={seekToFraction}
            title="Seek"
          >
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${duration ? Math.min(100, (time / duration) * 100) : 0}%` }}
            />
          </div>
        </div>

        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-neutral-400">
          {mmss(time * 1000)}
          <span className="text-neutral-500"> / {duration ? mmss(duration * 1000) : "–:––"}</span>
        </span>

        {track.link && (
          <a
            href={track.link}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the episode page"
            className="shrink-0 text-neutral-400 transition-colors hover:text-neutral-200"
          >
            ↗
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close player"
          className="shrink-0 text-neutral-500 transition-colors hover:text-neutral-200"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * The "Listen" affordance next to every quote. Plays the take in the in-page
 * player when the episode's audio is known; falls back to the old external
 * episode link otherwise (e.g. sample data).
 */
export function ListenButton({
  meta,
  episodeId,
  startMs,
  caption,
  fallbackLink,
  label = "Listen",
  className = "font-medium text-emerald-400 hover:underline",
}: {
  meta?: EpisodeMeta | null;
  episodeId: string;
  startMs: number | null | undefined;
  caption?: string;
  fallbackLink?: string | null;
  label?: string;
  className?: string;
}) {
  const ctx = useContext(PlayerContext);
  if (meta?.audioUrl && ctx) {
    return (
      <button
        type="button"
        title="Play it right here, streamed from the official episode audio"
        className={className}
        onClick={() =>
          ctx.play({
            audioUrl: meta.audioUrl!,
            title: meta.title,
            episodeId,
            episodeNumber: meta.number,
            link: meta.link,
            startMs: startMs ?? null,
            caption,
          })
        }
      >
        ▶ {label}
        {startMs != null ? ` · ${mmss(startMs)}` : ""}
      </button>
    );
  }
  const href = fallbackLink ?? meta?.link;
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {label}
      {startMs != null ? ` · ${mmss(startMs)}` : ""} ↗
    </a>
  );
}
