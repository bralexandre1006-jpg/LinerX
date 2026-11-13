import { useMemo, useState } from "react";
import { DialogActions, DialogButton, DialogHeader } from "@/shared/ui";
import Dialog from "@/shared/ui/Dialog";
import CoverImage from "@/features/covers/ui/CoverImage";
import type { LibraryItemViewModel } from "../../types";
import {
  useLibraryVisibilityStore,
  type LibrarySourceKey,
} from "../../store/libraryVisibilityStore";

export function getItemSource(item: LibraryItemViewModel): LibrarySourceKey {
  if (item.source === "youtube") return "youtube";
  if (item.isOwned) return "liner";
  return "external";
}

const SOURCE_LABELS: Record<LibrarySourceKey, string> = {
  liner: "Mes playlists Liner",
  external: "Ajoutés depuis Liner (albums, artistes, playlists)",
  youtube: "Synchronisés depuis YouTube Music",
};

export const SPECIAL_CARDS = [
  { id: "__linerx_likes", label: "Titres aimés" },
  { id: "__linerx_cached", label: "Cached songs" },
  { id: "__linerx_local", label: "Sur cet appareil" },
] as const;

const KIND_LABELS: Record<LibraryItemViewModel["kind"], string> = {
  playlist: "Playlist",
  album: "Album",
  artist: "Artiste",
};

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border text-[12px] ${
        checked
          ? "border-transparent bg-accent-primary text-white"
          : "border-border-alpha-14 bg-transparent"
      }`}
    >
      {checked ? "✓" : ""}
    </span>
  );
}

export default function LibraryVisibilityModal({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: LibraryItemViewModel[];
}) {
  const hiddenIds = useLibraryVisibilityStore((s) => s.hiddenIds);
  const hiddenSources = useLibraryVisibilityStore((s) => s.hiddenSources);
  const toggleItem = useLibraryVisibilityStore((s) => s.toggleItem);
  const toggleSource = useLibraryVisibilityStore((s) => s.toggleSource);
  const setAllItems = useLibraryVisibilityStore((s) => s.setAllItems);
  const reset = useLibraryVisibilityStore((s) => s.reset);
  const [query, setQuery] = useState("");

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const presentSources = useMemo(() => {
    const set = new Set(items.map(getItemSource));
    return (Object.keys(SOURCE_LABELS) as LibrarySourceKey[]).filter((s) =>
      set.has(s),
    );
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((i) =>
          `${i.title} ${i.subtitle}`.toLowerCase().includes(q),
        )
      : items;
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [items, query]);

  const shownIds = shown.map((i) => i.id);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      maxWidth={460}
      maxHeight="80vh"
    >
      <div className="flex max-h-[80vh] flex-col px-[20px] pb-[20px]">
        <DialogHeader
          className="mb-[12px]"
          title="Affichage de la bibliothèque"
          description="Coche ce que tu veux voir dans ta bibliothèque."
        />

        <div className="mb-[12px] flex flex-col gap-[4px]">
          <span className="text-caption text-text-tertiary">Raccourcis</span>
          {SPECIAL_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => toggleItem(card.id)}
              className="flex items-center gap-[10px] rounded-control border-0 bg-transparent p-[6px] text-left text-label text-text-primary cursor-pointer hover:bg-border-alpha-14"
            >
              <Checkbox checked={!hiddenSet.has(card.id)} />
              {card.label}
            </button>
          ))}
        </div>

        <div className="mb-[12px] flex flex-col gap-[4px]">
          <span className="text-caption text-text-tertiary">Sources</span>
          {presentSources.map((source) => {
            const checked = !hiddenSources.includes(source);
            return (
              <button
                key={source}
                type="button"
                onClick={() => toggleSource(source)}
                className="flex items-center gap-[10px] rounded-control border-0 bg-transparent p-[6px] text-left text-label text-text-primary cursor-pointer hover:bg-border-alpha-14"
              >
                <Checkbox checked={checked} />
                {SOURCE_LABELS[source]}
              </button>
            );
          })}
        </div>

        <div className="mb-[8px] flex items-center gap-[8px]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            spellCheck={false}
            className="h-[32px] min-w-0 flex-1 rounded-[9px] border border-border-alpha-14 bg-transparent px-[10px] text-label text-text-primary outline-none placeholder:text-text-secondary"
          />
          <button
            type="button"
            onClick={() => setAllItems(shownIds, false)}
            className="h-[32px] rounded-[9px] border-0 bg-fill px-[10px] text-caption text-text-primary cursor-pointer hover:bg-fill-hover"
          >
            Tout
          </button>
          <button
            type="button"
            onClick={() => setAllItems(shownIds, true)}
            className="h-[32px] rounded-[9px] border-0 bg-fill px-[10px] text-caption text-text-primary cursor-pointer hover:bg-fill-hover"
          >
            Aucun
          </button>
        </div>

        <div className="mb-[16px] min-h-0 flex-1 overflow-y-auto">
          {shown.map((item) => {
            const sourceHidden = hiddenSources.includes(getItemSource(item));
            const checked = !hiddenSet.has(item.id);
            return (
              <button
                key={`${item.kind}:${item.id}`}
                type="button"
                onClick={() => toggleItem(item.id)}
                className={`flex w-full items-center gap-[10px] rounded-control border-0 bg-transparent p-[6px] text-left cursor-pointer hover:bg-border-alpha-14 ${
                  sourceHidden ? "opacity-40" : ""
                }`}
              >
                <Checkbox checked={checked} />
                <div className="relative h-[36px] w-[36px] shrink-0 overflow-hidden rounded-item bg-border-alpha-14">
                  {item.imageUrl ? (
                    <CoverImage
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="36px"
                      draggable={false}
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-label text-text-primary">
                    {item.title}
                  </span>
                  <span className="truncate text-caption text-text-tertiary">
                    {KIND_LABELS[item.kind]} · {item.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <DialogActions>
          <DialogButton onClick={reset}>Tout réafficher</DialogButton>
          <DialogButton variant="primary" onClick={onClose}>
            Terminé
          </DialogButton>
        </DialogActions>
      </div>
    </Dialog>
  );
}
