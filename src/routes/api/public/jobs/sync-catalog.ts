import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { SITE, matchTitle, parsePageTitle, parseSitemapLocs, type SearchHit } from "@/lib/catalog";

const BATCH = 40;

async function tmdbSearch(query: string): Promise<SearchHit[]> {
  const key = process.env["TMDB_API_KEY"];
  if (!key) throw new Error("TMDB key missing");
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("query", query);
  url.searchParams.set("language", "pt-BR");
  const headers: Record<string, string> = { accept: "application/json" };
  if (key.length > 40) headers["Authorization"] = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return ((await res.json()) as { results: SearchHit[] }).results;
}

export const Route = createFileRoute("/api/public/jobs/sync-catalog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        try {
          const { neonQuery, neonExecute } = await import("@/lib/neon.server");
          const pending = await neonQuery<{ rows: { url: string; lastmod: string | null; processed_at: string | null }[] }>(
            "select url, lastmod, processed_at from public.site_pages where processed_at is null order by url limit $1",
            [BATCH],
          );

          if (!pending.rows.length) {
            const idxResponse = await fetch(`${SITE}/sitemap.xml`);
            if (!idxResponse.ok) throw new Error(`Sitemap ${idxResponse.status}`);
            const idx = await idxResponse.text();
            const maps = parseSitemapLocs(idx).filter((s) => s.loc.includes("sitemap-movie"));
            const known = await neonQuery<{ rows: { url: string; lastmod: string | null }[] }>(
              "select url, lastmod from public.site_pages limit 100000",
            );
            const knownMap = new Map(known.rows.map((k) => [k.url, k.lastmod]));
            let added = 0;
            for (const s of maps) {
              const response = await fetch(s.loc);
              if (!response.ok) throw new Error(`Sitemap ${response.status}`);
              const locs = parseSitemapLocs(await response.text());
              const rows = locs
                .filter((l) => !knownMap.has(l.loc) || (l.lastmod && knownMap.get(l.loc) !== l.lastmod))
                .map((l) => ({ url: l.loc, lastmod: l.lastmod, processed_at: null }));
              for (let i = 0; i < rows.length; i += 500) {
                await neonExecute(
                  `insert into public.site_pages (url, lastmod, processed_at)
                   select url, lastmod, processed_at from jsonb_to_recordset($1::jsonb)
                     as x(url text, lastmod date, processed_at timestamptz)
                   on conflict (url) do update set lastmod = excluded.lastmod, processed_at = excluded.processed_at`,
                  [JSON.stringify(rows.slice(i, i + 500))],
                );
              }
              added += rows.length;
            }
            return Response.json({ refreshed: true, queued: added });
          }

          let matched = 0;
          for (const p of pending.rows) {
            let title: string | null = null;
            let tmdbId: number | null = null;
            try {
              const html = await (await fetch(p.url)).text();
              title = parsePageTitle(html);
              if (title) {
                const hit = matchTitle(title, await tmdbSearch(title));
                if (hit) {
                  tmdbId = hit.id;
                  const now = new Date().toISOString();
                  await neonExecute([
                    {
                      query: `insert into public.site_catalog (tmdb_id, title, site_url, matched_at)
                        values ($1, $2, $3, $4::timestamptz) on conflict (tmdb_id) do update set
                        title = excluded.title, site_url = excluded.site_url, matched_at = excluded.matched_at`,
                      params: [hit.id, title, p.url, now],
                    },
                    {
                      query: "update public.site_pages set title = $1, tmdb_id = $2, processed_at = $3::timestamptz where url = $4",
                      params: [title, tmdbId, now, p.url],
                    },
                  ]);
                  matched++;
                  continue;
                }
              }
            } catch (e) {
              console.error("sync page failed", p.url, e);
            }
            await neonExecute(
              "update public.site_pages set title = $1, tmdb_id = $2, processed_at = $3::timestamptz where url = $4",
              [title, tmdbId, new Date().toISOString(), p.url],
            );
          }
          return Response.json({ processed: pending.rows.length, matched });
        } catch (error) {
          console.error(error);
          const { neonUserError } = await import("@/lib/neon.server");
          const failure = neonUserError(error);
          return Response.json({ error: failure.message }, { status: failure.status });
        }
      },
    },
  },
});
