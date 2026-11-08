import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface Genre {
  id: number;
  name: string;
}

export interface DiscoverMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string;
  genre_ids: number[];
}

export const getGenres = createServerFn({ method: "GET" }).handler(async () => {
  const { listGenres } = await import("./tmdb.server");
  return listGenres();
});

export const discoverMovies = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      genres: z.array(z.number().int()).min(1),
      gte: z.number(),
      lte: z.number(),
      match: z.enum(["all", "any"]).default("any"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { discoverAvailableMovies } = await import("./tmdb.server");
    return { results: await discoverAvailableMovies(data) };
  });

export const getMovieExtras = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const { getMovieExtrasById } = await import("./tmdb.server");
    return getMovieExtrasById(data.id);
  });
