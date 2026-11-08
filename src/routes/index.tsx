import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dices, Play, Star, Pencil, Film, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { discoverMovies, getMovieExtras, type DiscoverMovie } from "@/lib/tmdb.functions";
import { durationToRuntimeRange, pickBestGenreMatch, DURATION_LABEL } from "@/lib/sorteio";
import { posterUrl } from "@/lib/storage";
import { genresQuery } from "@/components/ProfileForm";
import { PosterImg } from "@/components/PosterImg";
import { RecommendationBox } from "@/components/RecommendationBox";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flixy — Escolha um filme para mim" },
      { name: "description", content: "Sorteie um filme sob medida para seus gêneros favoritos, humor e tempo disponível." },
      { property: "og:title", content: "Flixy — Escolha um filme para mim" },
      { property: "og:description", content: "Sorteie um filme sob medida para seu gosto e humor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

interface Result {
  movie: DiscoverMovie;
  siteUrl: string;
  runtime: number | null;
  genres: string[];
  trailerKey: string | null;
}

function Index() {
  const { ready, profile, history, addHistory } = useApp();
  const navigate = useNavigate();
  const { data: allGenres } = useQuery(genresQuery);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !profile) navigate({ to: "/onboarding", replace: true });
  }, [ready, profile, navigate]);

  async function sortear() {
    if (!profile) return;
    setLoading(true);
    setEmpty(false);
    setError(null);
    try {
      const range = durationToRuntimeRange(profile.duration);
      const exclude = [...history.map((h) => h.movieId), ...(result ? [result.movie.id] : [])];
      const favs = [...profile.genres];
      // 1) filmes com TODOS os gêneros escolhidos; 2) senão, o mais próximo possível
      let picked: (DiscoverMovie & { siteUrl: string }) | null = null;
      let relaxed = false;
      if (favs.length > 1) {
        const { results } = await discoverMovies({ data: { genres: favs, ...range, match: "all" } });
        picked = pickBestGenreMatch(results, favs, exclude);
      }
      if (!picked) {
        const { results } = await discoverMovies({ data: { genres: favs, ...range, match: "any" } });
        picked = pickBestGenreMatch(results, favs, exclude);
        relaxed = favs.length > 1 && !!picked;
      }
      if (!picked) {
        setEmpty(true);
        setResult(null);
        return;
      }
      if (relaxed) toast("Não achamos um filme com todos os gêneros; escolhemos o mais próximo.");
      const extras = await getMovieExtras({ data: { id: picked.id } });
      setResult({ movie: picked, siteUrl: picked.siteUrl, ...extras });
      await addHistory({
        movieId: picked.id,
        title: picked.title,
        posterPath: picked.poster_path,
        voteAverage: picked.vote_average,
        genres: extras.genres,
        date: new Date().toISOString(),
        moodAtTime: profile.mood,
        durationAtTime: profile.duration,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao buscar";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!ready || !profile) {
    return <div className="mx-auto max-w-6xl p-8"><Skeleton className="h-[60vh] w-full" /></div>;
  }

  const genreNames = profile.genres.map((id) => allGenres?.find((g) => g.id === id)?.name).filter(Boolean);
  const m = result?.movie;
  const backdrop = m ? posterUrl(m.backdrop_path, "w1280") : null;

  return (
    <main>
      <section className="relative min-h-[70vh] overflow-hidden">
        {backdrop && <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover animate-in fade-in duration-700" />}
        <div className="absolute inset-0 hero-fade" />
        <div className="relative mx-auto flex min-h-[70vh] max-w-6xl flex-col justify-end gap-6 px-4 py-12 md:flex-row md:items-end md:justify-start">
          {loading ? (
            <div className="flex gap-6">
              <Skeleton className="hidden h-80 w-56 md:block" />
              <div className="space-y-3"><Skeleton className="h-14 w-96 max-w-full" /><Skeleton className="h-5 w-64" /><Skeleton className="h-20 w-[28rem] max-w-full" /></div>
            </div>
          ) : m ? (
            <div key={m.id} className="flex gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PosterImg path={m.poster_path} title={m.title} className="hidden h-80 w-56 shrink-0 rounded-lg shadow-2xl md:block" />
              <div className="max-w-xl">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-primary">Sorteado para você</p>
                  <a href={result.siteUrl} target="_blank" rel="noopener noreferrer">
                    <Badge className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90"><CheckCircle2 className="h-3.5 w-3.5" /> Disponível no app</Badge>
                  </a>
                </div>
                <h1 className="font-display text-6xl leading-none tracking-wide md:text-7xl">{m.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <span>{m.release_date?.slice(0, 4)}</span>
                  {result.runtime ? <span>· {result.runtime} min</span> : null}
                  <span>· {result.genres.join(" | ")}</span>
                  <span className="flex items-center gap-1 text-foreground">· <Star className="h-4 w-4 fill-primary text-primary" /> {m.vote_average.toFixed(1)}</span>
                </div>
                <p className="mt-4 line-clamp-5 text-foreground/90">{m.overview || "Sinopse não disponível."}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {result.trailerKey ? (
                    <Button asChild size="lg">
                      <a href={`https://www.youtube.com/watch?v=${result.trailerKey}`} target="_blank" rel="noopener noreferrer"><Play className="fill-current" /> Ver trailer</a>
                    </Button>
                  ) : (
                    <span className="self-center text-sm text-muted-foreground">Trailer não disponível</span>
                  )}
                  <Button size="lg" variant="secondary" onClick={sortear}><Dices /> Sortear outro</Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-xl">
              <h1 className="font-display text-6xl leading-none tracking-wide md:text-8xl">O que vamos<br /><span className="text-primary">assistir hoje?</span></h1>
              <p className="mt-4 text-muted-foreground">Um clique e a gente escolhe um filme que combina com você.</p>
              <Button size="lg" className="mt-6" onClick={sortear}><Dices /> Escolha um filme para mim</Button>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <RecommendationBox />

        {empty && (
          <Alert>
            <Film className="h-4 w-4" />
            <AlertTitle>Nenhum filme encontrado</AlertTitle>
            <AlertDescription className="flex items-center gap-3">Tente editar seu perfil. <Button asChild size="sm" variant="secondary"><Link to="/profile">Editar perfil</Link></Button></AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive"><AlertTitle>Algo deu errado</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
        )}

        <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
          <span className="text-sm text-muted-foreground">Seu perfil:</span>
          {genreNames.map((n) => <Badge key={n} variant="secondary">{n}</Badge>)}
          <Badge variant="outline">{DURATION_LABEL[profile.duration]}</Badge>
          <Button asChild size="sm" variant="ghost" className="ml-auto"><Link to="/profile"><Pencil /> Editar</Link></Button>
        </section>

        {history.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold">Sorteados recentemente</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {history.slice(0, 12).map((h) => (
                <div key={h.movieId + h.date} className="w-36 shrink-0">
                  <PosterImg path={h.posterPath} title={h.title} className="aspect-[2/3] w-full rounded-md" />
                  <p className="mt-2 truncate text-sm">{h.title}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="h-3 w-3 fill-primary text-primary" /> {h.voteAverage.toFixed(1)}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

