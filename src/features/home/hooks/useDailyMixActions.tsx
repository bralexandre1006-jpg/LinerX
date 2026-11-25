import { useState, useCallback, useRef } from "react";
import { useStableNavigate } from "@/shared/hooks/useStableNavigate";
import { playerEngine } from "@/features/player";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import type { DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import type { DailyMix } from "./useDailyMixes";
import { PlayFill, AddFill, Playlist2Fill } from "@mingcute/react";
import { api, ApiError } from "@/shared/api";
import { notifyLibraryChanged } from "@/features/library/hooks/usePlaylists";
import { isLocalTrackId } from "@/shared/media/local/localTrackIds";

const SAVE_CONCURRENCY = 4;

async function saveMixAsPlaylist(mix: DailyMix): Promise<number> {
  const date = new Date().toLocaleDateString("fr-FR");
  const playlist = await api.createPlaylist({
    title: `${mix.title} · ${date}`,
    description: mix.description || undefined,
  });
  const ids = [
    ...new Set(
      mix.tracks.map((t) => t.id).filter((id) => id && !isLocalTrackId(id)),
    ),
  ];
  let saved = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        await api.addPlaylistTrack(playlist.id, id);
        saved += 1;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) saved += 1;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SAVE_CONCURRENCY, ids.length) }, worker),
  );
  notifyLibraryChanged();
  return saved;
}

export function useDailyMixActions(mix: DailyMix) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useStableNavigate();
  const trackDoubleClickBehavior = usePlayerStore(
    (state) => state.trackDoubleClickBehavior,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePlay = useCallback(() => {
    if (mix.tracks.length === 0) return;
    const firstTrack = mix.tracks[0];
    if (!firstTrack) return;
    void playerEngine.playTrack(
      firstTrack,
      mix.tracks,
      mix.title,
      mix.coverUrl || firstTrack.coverUrl,
    );
  }, [mix]);

  const handleAddQueue = useCallback(() => {
    if (mix.tracks.length === 0) return;
    for (const track of mix.tracks) {
      playerEngine.addToQueue({
        id: track.id,
        title: track.title,
        artists: track.artists,
        coverUrl: track.coverUrl,
        durationMs: track.durationMs,
        playCount: track.playCount ?? 0,
      });
    }
    toast(t("common.added_to_queue"), "checkmark", {
      description: `${mix.title} (${mix.trackCount} ${t("library.tracks")})`,
    });
  }, [mix, toast, t]);

  const savingRef = useRef(false);
  const handleSaveAsPlaylist = useCallback(() => {
    if (savingRef.current || mix.tracks.length === 0) return;
    savingRef.current = true;
    toast("Création de la playlist…", "info", { description: mix.title });
    saveMixAsPlaylist(mix)
      .then((saved) =>
        toast("Playlist créée", "checkmark", {
          description: `${mix.title} (${saved} titres)`,
        }),
      )
      .catch(() => toast("Impossible de créer la playlist", "error"))
      .finally(() => {
        savingRef.current = false;
      });
  }, [mix, toast]);

  const menuItems: DropdownMenuItem[] = [
    {
      id: "play",
      label: t("artist.play"),
      icon: <PlayFill size={16} />,
      onClick: handlePlay,
    },
    {
      id: "add_to_queue",
      label: t("artist.add_to_queue"),
      icon: <AddFill size={16} />,
      onClick: handleAddQueue,
    },
    {
      id: "save_as_playlist",
      label: "Enregistrer en playlist",
      icon: <Playlist2Fill size={16} />,
      onClick: handleSaveAsPlaylist,
    },
  ];

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (trackDoubleClickBehavior === "queue") {
      handleAddQueue();
    } else {
      handlePlay();
    }
  }, [trackDoubleClickBehavior, handleAddQueue, handlePlay]);

  const handleClick = (e: React.MouseEvent) => {
    const detail = (e as React.MouseEvent<HTMLDivElement>).detail;
    if (detail >= 2) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      handleDoubleClick();
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      navigate(`/collection?type=playlist&id=${encodeURIComponent(mix.id)}`);
    }, 200);
  };

  return {
    menuItems,
    menuOpen,
    setMenuOpen,
    menuPosition,
    setMenuPosition,
    handleContextMenu,
    handleClick,
  };
}
