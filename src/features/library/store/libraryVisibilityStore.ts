import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type LibrarySourceKey = "liner" | "external" | "youtube";

interface LibraryVisibilityState {
  hiddenIds: string[];
  hiddenSources: LibrarySourceKey[];
  toggleItem: (id: string) => void;
  toggleSource: (source: LibrarySourceKey) => void;
  setAllItems: (ids: string[], hidden: boolean) => void;
  reset: () => void;
}

export const useLibraryVisibilityStore = create<LibraryVisibilityState>()(
  persist(
    (set) => ({
      hiddenIds: [],
      hiddenSources: [],
      toggleItem: (id) =>
        set((s) => ({
          hiddenIds: s.hiddenIds.includes(id)
            ? s.hiddenIds.filter((x) => x !== id)
            : [...s.hiddenIds, id],
        })),
      toggleSource: (source) =>
        set((s) => ({
          hiddenSources: s.hiddenSources.includes(source)
            ? s.hiddenSources.filter((x) => x !== source)
            : [...s.hiddenSources, source],
        })),
      setAllItems: (ids, hidden) =>
        set((s) => {
          const others = s.hiddenIds.filter((x) => !ids.includes(x));
          return { hiddenIds: hidden ? [...others, ...ids] : others };
        }),
      reset: () => set({ hiddenIds: [], hiddenSources: [] }),
    }),
    {
      name: "linerx_library_visibility_v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
