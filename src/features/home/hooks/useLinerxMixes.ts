import { useCallback, useEffect, useState } from "react";
import { api, toClientTrack } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import type { Track } from "@/shared/types";
import { isLocalTrackId } from "@/shared/media/local/localTrackIds";
import { likedTracksSnapshot } from "@/features/library/hooks/useLikedTracks";
import type { CollectionPageData } from "@/features/collection/hooks/useCollection";
import type { DailyMix } from "./useDailyMixes";

export const LINERX_MIX_PREFIX = "linerx-mix-";
const STORAGE_KEY = "linerx_mixes_v1";
const MIX_SIZE = 50;
const HISTORY_PAGES = 4;
const ARTIST_MIXES = 4;
const CONCURRENCY = 4;

interface StoredMixes {
  day: string;
  mixes: DailyMix[];
}

const today = () => new Date().toISOString().slice(0, 10);

function readStored(): StoredMixes | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredMixes) : null;
  } catch {
    return null;
  }
}

function writeStored(value: StoredMixes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

export function getLinerxMix(id: string): DailyMix | undefined {
  return readStored()?.mixes.find((m) => m.id === id);
}

export function linerxMixToCollection(mix: DailyMix): CollectionPageData {
  return {
    type: "playlist",
    title: mix.title,
    author: mix.clusterArtists.join(", ") || "LinerX",
    description: mix.description,
    coverUrl: mix.coverUrl || "",
    tracks: mix.tracks,
    isDailyMix: true,
  };
}

function primaryArtist(track: Track): string {
  return (
    track.artistList?.[0]?.name || track.artists.split(",")[0]?.trim() || ""
  );
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function mapLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );
  return out;
}

async function similarTo(trackId: string, k: number): Promise<Track[]> {
  try {
    const res = await api.getRadio(trackId, { k });
    return res.items.map(toClientTrack);
  } catch {
    return [];
  }
}

/** round-robin merge so each seed contributes evenly */
function interleave(lists: Track[][], exclude: Set<string>, max: number) {
  const seen = new Set<string>();
  const out: Track[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < max; i++) {
    for (const list of lists) {
      const t = list[i];
      if (!t || seen.has(t.id) || exclude.has(t.id) || isLocalTrackId(t.id))
        continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= max) break;
    }
  }
  return out;
}

function toMix(
  id: string,
  title: string,
  description: string,
  tracks: Track[],
): DailyMix {
  const artists: string[] = [];
  for (const t of tracks) {
    const a = primaryArtist(t);
    if (a && !artists.includes(a)) artists.push(a);
    if (artists.length >= 4) break;
  }
  return {
    id: `${LINERX_MIX_PREFIX}${id}`,
    title,
    description,
    clusterArtists: artists,
    coverUrl: tracks[0]?.coverUrl,
    trackCount: tracks.length,
    tracks,
  };
}

async function generateMixes(): Promise<DailyMix[]> {
  const played: Track[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < HISTORY_PAGES; page++) {
    const res = await api.getHistory(cursor, 100);
    for (const entry of res.items || []) {
      if (entry.track?.id) played.push(toClientTrack(entry.track));
    }
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  if (played.length === 0) return [];

  const trackPlays = new Map<string, { track: Track; count: number }>();
  for (const t of played) {
    const cur = trackPlays.get(t.id);
    if (cur) cur.count += 1;
    else trackPlays.set(t.id, { track: t, count: 1 });
  }
  const ranked = [...trackPlays.values()].sort((a, b) => b.count - a.count);

  const artistPlays = new Map<string, number>();
  for (const t of played) {
    const a = primaryArtist(t);
    if (a) artistPlays.set(a, (artistPlays.get(a) ?? 0) + 1);
  }
  const topArtists = [...artistPlays.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, ARTIST_MIXES)
    .map(([name]) => name);

  const heard = new Set(trackPlays.keys());
  const liked = new Set(likedTracksSnapshot().tracks.map((t) => t.id));
  const known = new Set([...heard, ...liked]);

  const mixes: DailyMix[] = [];

  // discoveries: only tracks never played nor liked
  const discoverySeeds = ranked.slice(0, 10).map((r) => r.track.id);
  const discoveryLists = await mapLimit(discoverySeeds, (id) =>
    similarTo(id, 30),
  );
  const discoveries = interleave(discoveryLists, known, MIX_SIZE);
  if (discoveries.length > 0) {
    mixes.push(
      toMix(
        "discover",
        "Découvertes pour toi",
        "Des sons que tu n'as jamais écoutés, proches de ce que tu aimes.",
        discoveries,
      ),
    );
  }

  // one mix per favourite artist: some of their tracks + similar ones
  for (const [index, artist] of topArtists.entries()) {
    const own = ranked
      .filter((r) => primaryArtist(r.track) === artist)
      .map((r) => r.track);
    const seeds = own.slice(0, 3).map((t) => t.id);
    const lists = await mapLimit(seeds, (id) => similarTo(id, 30));
    const similar = interleave(lists, new Set(), MIX_SIZE);
    const fromArtist = own.slice(0, 8);
    const merged = interleave(
      [shuffle(fromArtist), similar],
      new Set(),
      MIX_SIZE,
    );
    if (merged.length < 10) continue;
    mixes.push(
      toMix(
        `artist-${index}`,
        `Mix ${artist}`,
        `${artist} et des artistes proches.`,
        merged,
      ),
    );
  }

  // favourites rediscovered: most-played tracks mixed with similar
  const favSeeds = shuffle(ranked.slice(0, 20)).slice(0, 6);
  const favLists = await mapLimit(favSeeds, (r) => similarTo(r.track.id, 15));
  const favourites = interleave(
    [ranked.slice(0, 25).map((r) => r.track), ...favLists],
    new Set(),
    MIX_SIZE,
  );
  if (favourites.length >= 10) {
    mixes.push(
      toMix(
        "favourites",
        "Tes favoris & plus",
        "Tes sons les plus écoutés, mélangés avec des sons similaires.",
        favourites,
      ),
    );
  }

  return mixes;
}

function primeCollections(mixes: DailyMix[]) {
  for (const mix of mixes) {
    queryCache.set(`collection:playlist:${mix.id}`, linerxMixToCollection(mix));
  }
}

let inFlight: Promise<DailyMix[]> | null = null;

function regenerate(): Promise<DailyMix[]> {
  if (!inFlight) {
    inFlight = generateMixes()
      .then((mixes) => {
        if (mixes.length > 0) writeStored({ day: today(), mixes });
        return mixes;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useLinerxMixes() {
  const [mixes, setMixes] = useState<DailyMix[]>(
    () => readStored()?.mixes ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(() => {
    setIsLoading(true);
    regenerate()
      .then((next) => {
        if (next.length > 0) setMixes(next);
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (!stored || stored.day !== today() || stored.mixes.length === 0) {
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    primeCollections(mixes);
  }, [mixes]);

  return { mixes, isLoading, refresh };
}
