import { useState } from "react";
import { CheckCircle2, LoaderCircle, Play, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PosterImg } from "@/components/PosterImg";
import { recommendMovie } from "@/lib/recommendation.functions";
import type { DiscoverMovie } from "@/lib/tmdb.functions";

type Recommendation = {
  movie: DiscoverMovie;
  siteUrl: string;
  explanation: string;
  runtime: number | null;
  genres: string[];
  tagline: string;
  trailerKey: string | null;
};

export function RecommendationBox() {
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await recommendMovie({ data: { description } });
      if (!result) {
        setRecommendation(null);
        setError("Não encontrei um filme disponível para esse pedido. Tente acrescentar outros detalhes.");
      } else {
        setRecommendation(result);
      }
    } catch (err) {
      setRecommendation(null);
      setError(err instanceof Error ? err.message : "Não foi possível gerar a recomendação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid gap-8 p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
        <div>
          <div className="mb-3 flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-medium">Recomendação inteligente</span>
          </div>
          <h2 className="font-display text-4xl tracking-wide">Do seu jeito, sem rolar o catálogo</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Conte o clima, a história ou o tipo de companhia. A escolha sai somente dos filmes disponíveis.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            <label htmlFor="movie-description" className="text-sm font-medium">O que você quer assistir?</label>
            <Textarea
              id="movie-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={10}
              maxLength={1000}
              required
              rows={4}
              placeholder="Ex.: quero uma comédia leve para assistir com minha família, sem ser infantil..."
            />
            <Button type="submit" disabled={busy || description.trim().length < 10}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {busy ? "Escolhendo seu filme..." : "Recomendar um filme"}
            </Button>
          </form>
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex min-h-64 items-center rounded-lg border border-border bg-background/60 p-5">
          {recommendation ? (
            <div className="flex w-full flex-col gap-5 sm:flex-row">
              <PosterImg path={recommendation.movie.poster_path} title={recommendation.movie.title} className="h-64 w-44 shrink-0 self-center rounded-lg object-cover sm:self-start" />
              <div>
                <a href={recommendation.siteUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                  <Badge className="mb-3 gap-1 bg-accent text-accent-foreground hover:bg-accent/90">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Disponível no app
                  </Badge>
                </a>
                <h3 className="font-display text-3xl tracking-wide">{recommendation.movie.title}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{recommendation.movie.release_date?.slice(0, 4)}</span>
                  {recommendation.runtime ? <span>· {recommendation.runtime} min</span> : null}
                  <span className="flex items-center gap-1">· <Star className="h-3 w-3 fill-primary text-primary" /> {recommendation.movie.vote_average.toFixed(1)}</span>
                </p>
                <p className="mt-4 text-sm leading-relaxed">{recommendation.explanation}</p>
                <p className="mt-3 text-xs text-muted-foreground">{recommendation.genres.join(" | ")}</p>
                {recommendation.trailerKey && (
                  <Button asChild size="sm" variant="secondary" className="mt-4">
                    <a href={`https://www.youtube.com/watch?v=${recommendation.trailerKey}`} target="_blank" rel="noopener noreferrer"><Play className="fill-current" /> Ver trailer</a>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-xs text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary/70" />
              {busy ? "Interpretando seu pedido e procurando no catálogo disponível..." : "Sua recomendação e o motivo da escolha vão aparecer aqui."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
