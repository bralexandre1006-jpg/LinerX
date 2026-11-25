import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { SkipNext, SkipPrevious } from "@solar-icons/react";
import {
  PlayerMorphIcon,
  ICON_PLAY,
  ICON_PAUSE,
} from "@/features/player/ui/morphPlayerIcons";
import {
  HeartFill,
  HeartLine,
  PinFill,
  PinLine,
  FullscreenLine,
  FullscreenExitLine,
} from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";
import { ScrollableText } from "@/shared/ui/ScrollableText";
import { useDisableButtonFocus } from "@/features/navigation/hooks/useDisableButtonFocus";
import type { OverlayAction, OverlayStatePayload } from "../contracts";
import { useShortcutsStore, matchesShortcut } from "@/features/shortcuts";
import { isLocalTrackId } from "@/shared/media/local/localTrackIds";

function sampledPositionMs({
  status,
  positionMs,
  positionAt,
  playbackRate,
}: Pick<
  OverlayStatePayload,
  "status" | "positionMs" | "positionAt" | "playbackRate"
>): number {
  if (status !== "playing" || typeof positionAt !== "number") {
    return positionMs;
  }
  const rate = playbackRate && playbackRate > 0 ? playbackRate : 1;
  return positionMs + Math.max(0, Date.now() - positionAt) * rate;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const stopMouseDown = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

const OVERLAY_CARD_TRANSITION = {
  duration: 0.08,
  ease: [0.16, 1, 0.3, 1],
} as const;

export function OverlayPlayer() {
  useDisableButtonFocus();

  const [state, setState] = useState<OverlayStatePayload>({
    status: "idle",
    track: null,
    positionMs: 0,
    durationMs: 0,
    volume: 1,
    isLiked: false,
  });

  const [isInfoHovered, setIsInfoHovered] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    window.linerElectron
      ?.getOverlayLocked?.()
      .then((v) => setLocked(v === true));
  }, []);

  const toggleLocked = useCallback(() => {
    const next = !locked;
    setLocked(next);
    window.linerElectron
      ?.setOverlayLocked?.(next)
      .then((v) => setLocked(v === true));
  }, [locked]);
  const [size, setSize] = useState<"compact" | "large">("compact");
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    window.linerElectron
      ?.getOverlaySize?.()
      .then((v) => setSize(v === "large" ? "large" : "compact"));
  }, []);

  const toggleSize = useCallback(() => {
    const next = size === "large" ? "compact" : "large";
    setSize(next);
    window.linerElectron
      ?.setOverlaySize?.(next)
      .then((v) => setSize(v === "large" ? "large" : "compact"));
  }, [size]);
  const [isVisible, setIsVisible] = useState(true);
  const [isShown, setIsShown] = useState(
    () => !window.linerElectron?.onOverlayVisibility,
  );

  const anchorPosRef = useRef(state.positionMs);
  const anchorTimeRef = useRef(performance.now());
  const [interpolatedPosMs, setInterpolatedPosMs] = useState(state.positionMs);
  const lastTrackIdRef = useRef<string | null>(null);

  const pullLatestState = useCallback(() => {
    window.linerElectron?.getOverlayInitialState?.().then((initial) => {
      if (initial) {
        const pos = sampledPositionMs(initial);
        anchorPosRef.current = pos;
        anchorTimeRef.current = performance.now();
        setInterpolatedPosMs(pos);
        setState(initial);
      }
    });
  }, []);

  useEffect(() => {
    pullLatestState();

    if (window.linerElectron?.onOverlayState) {
      const cleanupState = window.linerElectron.onOverlayState((newState) => {
        setState(newState);
      });
      return cleanupState;
    }
  }, [pullLatestState]);

  useEffect(() => {
    const signal = setTimeout(() => window.linerElectron?.overlayReady?.(), 0);
    return () => clearTimeout(signal);
  }, []);

  useEffect(() => {
    if (!window.linerElectron?.onOverlayVisibility) return;
    const cleanupVisibility = window.linerElectron.onOverlayVisibility(
      (visible) => {
        setIsVisible(visible);
        setIsShown(visible);
        if (visible) pullLatestState();
      },
    );
    return cleanupVisibility;
  }, [pullLatestState]);

  const sendAction = useCallback((action: OverlayAction) => {
    window.linerElectron?.sendOverlayAction?.(action);
  }, []);

  const isPlaying = state.status === "playing";
  const rate =
    state.playbackRate && state.playbackRate > 0 ? state.playbackRate : 1;
  const durationMs = Math.max(
    1,
    state.durationMs || state.track?.durationMs || 1,
  );

  const interpolatedPosRef = useRef(interpolatedPosMs);
  useEffect(() => {
    interpolatedPosRef.current = interpolatedPosMs;
  }, [interpolatedPosMs]);

  const {
    status: stateStatus,
    positionMs: statePositionMs,
    positionAt: statePositionAt,
    playbackRate: statePlaybackRate,
  } = state;
  const stateTrackId = state.track?.id;

  useEffect(() => {
    const syncedPos = sampledPositionMs({
      status: stateStatus,
      positionMs: statePositionMs,
      positionAt: statePositionAt,
      playbackRate: statePlaybackRate,
    });
    if (stateTrackId !== lastTrackIdRef.current) {
      lastTrackIdRef.current = stateTrackId ?? null;
      setInterpolatedPosMs(syncedPos);
      anchorPosRef.current = syncedPos;
      anchorTimeRef.current = performance.now();
      return;
    }

    if (stateStatus === "paused") {
      const pos = syncedPos > 0 ? syncedPos : interpolatedPosRef.current;
      setInterpolatedPosMs(pos);
      anchorPosRef.current = pos;
      anchorTimeRef.current = performance.now();
      return;
    }

    if (syncedPos > 0 || interpolatedPosRef.current === 0) {
      setInterpolatedPosMs(syncedPos);
      anchorPosRef.current = syncedPos;
      anchorTimeRef.current = performance.now();
    }
  }, [
    statePositionMs,
    statePositionAt,
    stateStatus,
    statePlaybackRate,
    stateTrackId,
  ]);

  useEffect(() => {
    if (!isPlaying || !isShown) return;
    let animId: number;

    const step = () => {
      const elapsed = performance.now() - anchorTimeRef.current;
      const current = Math.min(
        durationMs,
        anchorPosRef.current + elapsed * rate,
      );
      setInterpolatedPosMs(current);
      animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animId);
      const elapsed = performance.now() - anchorTimeRef.current;
      anchorPosRef.current = Math.min(
        durationMs,
        anchorPosRef.current + elapsed * rate,
      );
      anchorTimeRef.current = performance.now();
    };
  }, [isPlaying, isShown, durationMs, rate]);

  const currentPosMs = interpolatedPosMs;
  const progressRatio = Math.min(1, Math.max(0, currentPosMs / durationMs));

  // Keyboard Shortcuts (Miniplayer mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const { miniplayer, volumeHoldRepeats } = useShortcutsStore.getState();

      // Sound up / down shortcuts
      if (matchesShortcut(e, miniplayer.volumeUp)) {
        e.preventDefault();
        if (e.repeat && !volumeHoldRepeats) return;
        sendAction({ type: "volumeUp" });
        return;
      }

      if (matchesShortcut(e, miniplayer.volumeDown)) {
        e.preventDefault();
        if (e.repeat && !volumeHoldRepeats) return;
        sendAction({ type: "volumeDown" });
        return;
      }

      // Switch to main app
      if (matchesShortcut(e, miniplayer.focusMainWindow)) {
        e.preventDefault();
        sendAction({ type: "focusMainWindow" });
        return;
      }

      // Playback toggle
      if (matchesShortcut(e, miniplayer.playPause)) {
        e.preventDefault();
        sendAction({ type: "togglePlay" });
        return;
      }

      // Seek left / right
      if (matchesShortcut(e, miniplayer.seekBackward)) {
        e.preventDefault();
        sendAction({
          type: "seek",
          payload: { positionMs: Math.max(0, currentPosMs - 5000) },
        });
        return;
      }

      if (matchesShortcut(e, miniplayer.seekForward)) {
        e.preventDefault();
        sendAction({
          type: "seek",
          payload: { positionMs: Math.min(durationMs, currentPosMs + 5000) },
        });
        return;
      }

      // Like
      if (matchesShortcut(e, miniplayer.likeTrack)) {
        e.preventDefault();
        if (!isLocalTrackId(stateTrackId)) sendAction({ type: "like" });
        return;
      }

      // Previous
      if (matchesShortcut(e, miniplayer.prevTrack)) {
        e.preventDefault();
        sendAction({ type: "prev" });
        return;
      }

      // Next
      if (matchesShortcut(e, miniplayer.nextTrack)) {
        e.preventDefault();
        sendAction({ type: "next" });
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPosMs, durationMs, sendAction, state.volume, stateTrackId]);

  const coverSrc = state.track?.coverUrl || state.track?.cover || "";
  const dragStyle = {
    WebkitAppRegion: locked ? "no-drag" : "drag",
  } as React.CSSProperties;
  const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  const pinButton = (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={stopMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        toggleLocked();
      }}
      className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent transition-colors outline-none cursor-pointer active:scale-90 ${
        locked ? "text-white" : "text-white/40 hover:text-white"
      }`}
      aria-label={locked ? "Déverrouiller la position" : "Fixer la position"}
      title={locked ? "Déverrouiller la position" : "Fixer la position"}
    >
      {locked ? <PinFill size={14} /> : <PinLine size={14} />}
    </button>
  );

  const sizeButton = (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={stopMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        toggleSize();
      }}
      className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-white/40 hover:text-white transition-colors outline-none cursor-pointer active:scale-90"
      aria-label={size === "large" ? "Réduire le widget" : "Agrandir le widget"}
      title={size === "large" ? "Réduire le widget" : "Agrandir le widget"}
    >
      {size === "large" ? (
        <FullscreenExitLine size={14} />
      ) : (
        <FullscreenLine size={14} />
      )}
    </button>
  );

  if (size === "large") {
    return (
      <div
        className="flex h-screen w-screen select-none flex-col bg-transparent antialiased overflow-hidden font-sans p-1 m-0 border-0"
        style={dragStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.div
          initial={false}
          animate={{ opacity: isVisible ? 1 : 0, scale: isVisible ? 1 : 0.95 }}
          transition={OVERLAY_CARD_TRANSITION}
          className="relative flex h-full w-full flex-col overflow-hidden rounded-[22px] bg-[#0d0d10]"
          style={{ willChange: "transform, opacity" }}
        >
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover opacity-60"
              style={{ filter: "blur(36px) saturate(1.4)" }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-black/35" />

          <div className="relative z-[2] flex h-full w-full gap-[14px] p-[14px]">
            <div className="relative h-[140px] w-[140px] shrink-0 overflow-hidden rounded-[14px] bg-white/10 shadow-lg">
              {coverSrc ? (
                <CoverImage
                  key={coverSrc}
                  src={coverSrc}
                  alt={state.track?.title || "Artwork"}
                  fill
                  sizes="140px"
                  priority
                  unoptimized
                  draggable={false}
                  className="object-cover pointer-events-none select-none"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[32px] text-white/30">
                  ♪
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div className="flex items-start gap-[4px]">
                <div
                  className="flex min-w-0 flex-1 flex-col"
                  onMouseEnter={() => setIsInfoHovered(true)}
                  onMouseLeave={() => setIsInfoHovered(false)}
                >
                  <ScrollableText
                    text={state.track?.title || "Aucune lecture"}
                    isParentHovered={isInfoHovered}
                    className="text-[16px] font-semibold leading-[20px] text-white tracking-tight"
                  />
                  <ScrollableText
                    text={state.track?.artist || ""}
                    isParentHovered={isInfoHovered}
                    className="mt-[2px] text-[13px] leading-[16px] text-white/65"
                  />
                </div>
                <div
                  className={`flex shrink-0 items-center transition-opacity ${
                    isHovered || locked ? "opacity-100" : "opacity-0"
                  }`}
                  style={noDrag}
                >
                  {pinButton}
                  {sizeButton}
                </div>
              </div>

              <div style={noDrag}>
                <div
                  className="group relative h-[14px] w-full cursor-pointer"
                  onMouseDown={stopMouseDown}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.min(
                      1,
                      Math.max(0, (e.clientX - rect.left) / rect.width),
                    );
                    const positionMs = Math.round(ratio * durationMs);
                    anchorPosRef.current = positionMs;
                    anchorTimeRef.current = performance.now();
                    setInterpolatedPosMs(positionMs);
                    sendAction({ type: "seek", payload: { positionMs } });
                  }}
                >
                  <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-[height] group-hover:h-[6px]">
                    <div
                      className="h-full rounded-full bg-white"
                      style={{ width: `${progressRatio * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-[10.5px] tabular-nums text-white/55">
                  <span>{formatTime(currentPosMs)}</span>
                  <span>
                    -{formatTime(Math.max(0, durationMs - currentPosMs))}
                  </span>
                </div>
              </div>

              <div
                className="flex items-center justify-center gap-[14px]"
                style={noDrag}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {!isLocalTrackId(state.track?.id) ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={stopMouseDown}
                    onClick={(e) => {
                      e.stopPropagation();
                      sendAction({ type: "like" });
                    }}
                    className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-0 bg-transparent outline-none cursor-pointer active:scale-90 transition-colors ${
                      state.isLiked
                        ? "text-[#ff3b5c]"
                        : "text-white/55 hover:text-white"
                    }`}
                    aria-label={state.isLiked ? "Unlike" : "Like"}
                  >
                    {state.isLiked ? (
                      <HeartFill size={18} />
                    ) : (
                      <HeartLine size={18} />
                    )}
                  </button>
                ) : (
                  <span className="w-[30px]" />
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={stopMouseDown}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendAction({ type: "prev" });
                  }}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-0 bg-transparent text-white/85 hover:text-white active:scale-90 transition-all outline-none cursor-pointer"
                  aria-label="Previous"
                >
                  <SkipPrevious size={24} weight="Bold" />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={stopMouseDown}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendAction({ type: "togglePlay" });
                  }}
                  className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-full bg-white text-black shadow transition-all duration-150 ease-out hover:scale-105 active:scale-95 border-none cursor-pointer"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  <span
                    className={`flex items-center justify-center ${
                      isPlaying ? "" : "translate-x-[1px]"
                    }`}
                  >
                    <PlayerMorphIcon
                      icon={isPlaying ? ICON_PAUSE : ICON_PLAY}
                      size={18}
                    />
                  </span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={stopMouseDown}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendAction({ type: "next" });
                  }}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-0 bg-transparent text-white/85 hover:text-white active:scale-90 transition-all outline-none cursor-pointer"
                  aria-label="Next"
                >
                  <SkipNext size={24} weight="Bold" />
                </button>
                <span className="w-[30px]" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-screen select-none flex-col justify-start bg-transparent antialiased overflow-hidden font-sans p-1 m-0 border-0"
      style={dragStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Main Overlay Card ── */}
      <motion.div
        initial={false}
        animate={{
          opacity: isVisible ? 1 : 0,
          scale: isVisible ? 1 : 0.92,
        }}
        transition={OVERLAY_CARD_TRANSITION}
        className="relative flex w-full shrink-0 flex-col overflow-hidden rounded-[10px] bg-[#0d0d10]"
        style={{
          height: "48px",
          willChange: "transform, opacity",
          transformOrigin: "center center",
        }}
      >
        {/* Background Progress Fill - Straight rectangular without rounding */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] rounded-none"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            width: `${progressRatio * 100}%`,
            transition: "width 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />

        {/* Content Row */}
        <div className="relative z-[2] flex h-full w-full items-center justify-between px-2.5">
          {/* Left: Artwork + Track Info (Fully draggable to drag window) */}
          <div
            className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden cursor-default pr-2"
            onMouseEnter={() => setIsInfoHovered(true)}
            onMouseLeave={() => setIsInfoHovered(false)}
          >
            <div className="relative h-[32px] w-[32px] shrink-0 overflow-hidden rounded-item bg-[#16161a]">
              {state.track?.coverUrl || state.track?.cover ? (
                <CoverImage
                  key={state.track.coverUrl || state.track.cover}
                  src={state.track.coverUrl || state.track.cover || ""}
                  alt={state.track?.title || "Artwork"}
                  fill
                  sizes="32px"
                  priority
                  unoptimized
                  draggable={false}
                  className="rounded-item object-cover pointer-events-none select-none"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[11px] text-white/30 select-none">
                  ♪
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
              <ScrollableText
                text={state.track?.title || "No track playing"}
                isParentHovered={isInfoHovered}
                className="text-body font-normal leading-[16px] text-white tracking-tight"
              />
              <ScrollableText
                text={state.track?.artist || ""}
                isParentHovered={isInfoHovered}
                className="mt-[1px] text-[11px] font-light leading-[14px] text-white/50"
              />
            </div>
          </div>

          {/* Right: Like Button + Playback Controls (Previous, Play/Pause, Next) */}
          <div
            className="flex items-center gap-0.5 shrink-0 pl-1"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(isHovered || locked) && (
              <>
                {pinButton}
                {sizeButton}
              </>
            )}
            {!isLocalTrackId(state.track?.id) && (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  sendAction({ type: "like" });
                }}
                className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent transition-colors outline-none cursor-pointer active:scale-90 ${
                  state.isLiked
                    ? "text-[#ff3b5c]"
                    : "text-white/40 hover:text-white"
                }`}
                aria-label={state.isLiked ? "Unlike" : "Like"}
              >
                {state.isLiked ? (
                  <HeartFill size={16} />
                ) : (
                  <HeartLine size={16} />
                )}
              </button>
            )}

            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                sendAction({ type: "prev" });
              }}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border-0 bg-transparent text-white/60 hover:text-white active:scale-90 transition-all outline-none cursor-pointer"
              aria-label="Previous"
            >
              <SkipPrevious size={16} weight="Bold" />
            </button>

            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                sendAction({ type: "togglePlay" });
              }}
              className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full bg-white text-black shadow transition-all duration-150 ease-out hover:scale-105 active:scale-95 border-none cursor-pointer"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <span
                className={`flex items-center justify-center transition-transform ${
                  isPlaying ? "" : "translate-x-[0.5px]"
                }`}
              >
                <PlayerMorphIcon
                  icon={isPlaying ? ICON_PAUSE : ICON_PLAY}
                  size={14}
                />
              </span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                sendAction({ type: "next" });
              }}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border-0 bg-transparent text-white/60 hover:text-white active:scale-90 transition-all outline-none cursor-pointer"
              aria-label="Next"
            >
              <SkipNext size={16} weight="Bold" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default OverlayPlayer;
