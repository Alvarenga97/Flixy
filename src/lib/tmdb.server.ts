import type { DiscoverMovie, Genre } from "./tmdb.functions";

const BASE = "https://api.themoviedb.org/3";

export async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const key = process.env["TMDB_API_KEY"];
  if (!key) throw new Error("Chave da TMDB não configurada");
  const url = new URL(BASE + path);
  url.searchParams.set("language", "pt-BR");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { accept: "application/json" };
  if (key.length > 40) headers["Authorization"] = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error("TMDB error", res.status, await res.text());
    if (res.status === 401) throw new Error("Chave da TMDB inválida");
    if (res.status === 429) throw new Error("Muitas requisições, tente em instantes");
    throw new Error("Erro ao buscar filmes");
  }
  return res.json() as Promise<T>;
}

export type AvailableMovie = DiscoverMovie & { siteUrl: string };
export type DiscoverOptions = {
  genres: number[];
  gte: number;
  lte: number;
  match: "all" | "any";
  minVoteCount?: number;
  maxRandomPages?: number;
};

export async function listGenres(): Promise<Genre[]> {
  const r = await tmdb<{ genres: Genre[] }>("/genre/movie/list");
  return r.genres;
}

export async function discoverAvailableMovies(data: DiscoverOptions): Promise<AvailableMovie[]> {
  const params: Record<string, string | number> = {
    "with_runtime.gte": data.gte,
    "with_runtime.lte": data.lte,
    "vote_count.gte": data.minVoteCount ?? 200,
    "primary_release_date.gte": `${new Date().getFullYear() - 10}-01-01`,
    include_adult: "false",
    region: "BR",
    sort_by: "popularity.desc",
  };
  if (data.genres.length) params["with_genres"] = data.genres.join(data.match === "all" ? "," : "|");
  const { neonQuery } = await import("./neon.server");

  async function available(list: DiscoverMovie[]): Promise<AvailableMovie[]> {
    if (!list.length) return [];
    const result = await neonQuery<{ rows: { tmdb_id: number; site_url: string }[] }>(
      "select tmdb_id, site_url from public.site_catalog where tmdb_id = any($1::int[])",
      [list.map((m) => m.id)],
    );
    const map = new Map(result.rows.map((r) => [r.tmdb_id, r.site_url]));
    return list.filter((m) => map.has(m.id)).map((m) => ({ ...m, siteUrl: map.get(m.id)! }));
  }

  const first = await tmdb<{ total_pages: number; results: DiscoverMovie[] }>("/discover/movie", params);
  if (!first.results.length) return [];
  const max = Math.min(first.total_pages, 500);
  const pages = new Set<number>([1]);
  const found = await available(first.results);
  for (let i = 0; i < (data.maxRandomPages ?? 6) && found.length === 0 && pages.size < max; i++) {
    let page = 1 + Math.floor(Math.random() * max);
    while (pages.has(page)) page = (page % max) + 1;
    pages.add(page);
    const r = await tmdb<{ results: DiscoverMovie[] }>("/discover/movie", { ...params, page });
    found.push(...await available(r.results));
  }
  return found;
}

export async function getMovieExtrasById(id: number) {
  const [details, videos] = await Promise.all([
    tmdb<{ runtime: number | null; genres: Genre[]; tagline: string }>(`/movie/${id}`),
    tmdb<{ results: { key: string; site: string; type: string; official: boolean }[] }>(`/movie/${id}/videos`, {
      language: "pt-BR",
      include_video_language: "pt,en",
    }),
  ]);
  const vids = videos.results.filter((v) => v.site === "YouTube" && v.type === "Trailer");
  const trailer = vids.find((v) => v.official) ?? vids[0];
  return {
    runtime: details.runtime,
    genres: details.genres.map((g) => g.name),
    tagline: details.tagline,
    trailerKey: trailer?.key ?? null,
  };
}
