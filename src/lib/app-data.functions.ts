import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DURATIONS, MOODS, type Duration, type Mood, type Profile } from "./sorteio";
import type { HistoryItem } from "./storage";

const profileInput = z.object({
  version: z.literal(1),
  genres: z.array(z.number().int()).min(1).max(19),
  mood: z.enum(MOODS),
  duration: z.enum(DURATIONS),
  updatedAt: z.string().datetime(),
});

const historyInput = z.object({
  movieId: z.number().int().positive(),
  title: z.string().min(1).max(300),
  posterPath: z.string().max(500).nullable(),
  voteAverage: z.number().min(0).max(10),
  genres: z.array(z.string().max(100)).max(20),
  date: z.string().datetime(),
  moodAtTime: z.string().max(50),
  durationAtTime: z.string().max(50),
});

type ProfileRow = { id: string; genres: number[]; mood: Mood; duration: Duration; updated_at_iso: string };
type HistoryRow = {
  movie_id: number;
  title: string;
  poster_path: string | null;
  vote_average: string | number | null;
  genres: string[];
  mood: string | null;
  duration: string | null;
  drawn_at_iso: string;
};

const fromHistoryRow = (r: HistoryRow): HistoryItem => ({
  movieId: r.movie_id,
  title: r.title,
  posterPath: r.poster_path,
  voteAverage: Number(r.vote_average ?? 0),
  genres: r.genres,
  date: r.drawn_at_iso,
  moodAtTime: r.mood ?? "",
  durationAtTime: r.duration ?? "",
});

const historyParams = (h: HistoryItem) => ({
  movie_id: h.movieId,
  title: h.title,
  poster_path: h.posterPath,
  vote_average: h.voteAverage,
  genres: h.genres,
  mood: h.moodAtTime,
  duration: h.durationAtTime,
  drawn_at: h.date,
});

async function readHistory(userId: string): Promise<HistoryItem[]> {
  const { neonQuery } = await import("./neon.server");
  const result = await neonQuery<{ rows: HistoryRow[] }>(
    `select movie_id, title, poster_path, vote_average, genres, mood, duration,
       to_json(drawn_at) as drawn_at_iso
     from public.draw_history where user_id = $1
     order by drawn_at desc limit 200`,
    [userId],
  );
  return result.rows.map(fromHistoryRow);
}

export const syncMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ localProfile: profileInput.nullable(), anonymousHistory: z.array(historyInput).max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<{ profile: Profile | null; history: HistoryItem[] }> => {
    const { neonQuery, neonExecute } = await import("./neon.server");
    const userId = context.userId;
    const current = await neonQuery<{ rows: ProfileRow[] }>(
      "select id, genres, mood, duration, to_json(updated_at) as updated_at_iso from public.profiles where id = $1 limit 1",
      [userId],
    );
    const remote = current.rows[0];
    let profile: Profile | null = null;
    if (remote && (!data.localProfile || Date.parse(remote.updated_at_iso) > Date.parse(data.localProfile.updatedAt))) {
      profile = { version: 1, genres: remote.genres, mood: remote.mood, duration: remote.duration, updatedAt: remote.updated_at_iso };
    } else if (data.localProfile) {
      profile = data.localProfile;
      await neonExecute(
        `insert into public.profiles (id, genres, mood, duration, updated_at)
         values ($1, $2::int[], $3, $4, $5::timestamptz)
         on conflict (id) do update set genres = excluded.genres, mood = excluded.mood,
           duration = excluded.duration, updated_at = excluded.updated_at`,
        [userId, profile.genres, profile.mood, profile.duration, profile.updatedAt],
      );
    }

    if (data.anonymousHistory.length) {
      await neonExecute(
        `insert into public.draw_history (user_id, movie_id, title, poster_path, vote_average, genres, mood, duration, drawn_at)
         select $1, movie_id, title, poster_path, vote_average, genres, mood, duration, drawn_at
         from jsonb_to_recordset($2::jsonb) as x(movie_id integer, title text, poster_path text,
           vote_average numeric, genres text[], mood text, duration text, drawn_at timestamptz)
         on conflict (user_id, movie_id, drawn_at) do nothing`,
        [userId, JSON.stringify(data.anonymousHistory.map(historyParams))],
      );
    }
    return { profile, history: await readHistory(userId) };
  });

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => profileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { neonExecute } = await import("./neon.server");
    await neonExecute(
      `insert into public.profiles (id, genres, mood, duration, updated_at)
       values ($1, $2::int[], $3, $4, $5::timestamptz)
       on conflict (id) do update set genres = excluded.genres, mood = excluded.mood,
         duration = excluded.duration, updated_at = excluded.updated_at`,
      [context.userId, data.genres, data.mood, data.duration, data.updatedAt],
    );
    return { ok: true };
  });

export const addMyHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => historyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { neonExecute } = await import("./neon.server");
    await neonExecute(
      `insert into public.draw_history (user_id, movie_id, title, poster_path, vote_average, genres, mood, duration, drawn_at)
       values ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9::timestamptz)`,
      [context.userId, data.movieId, data.title, data.posterPath, data.voteAverage, data.genres, data.moodAtTime, data.durationAtTime, data.date],
    );
    return { ok: true };
  });
