import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getGenres } from "@/lib/tmdb.functions";
import { DURATIONS, DURATION_LABEL, type Duration, type Mood, type Profile } from "@/lib/sorteio";
import { cn } from "@/lib/utils";

export const genresQuery = { queryKey: ["genres"], queryFn: () => getGenres(), staleTime: 86400000, gcTime: 7 * 86400000 };

interface Props {
  initial?: Profile | null;
  submitLabel: string;
  onSubmit: (v: { genres: number[]; mood: Mood; duration: Duration }) => Promise<void> | void;
}


export function ProfileForm({ initial, submitLabel, onSubmit }: Props) {
  const { data: genres, isLoading, error } = useQuery(genresQuery);
  const [sel, setSel] = useState<number[]>(initial?.genres ?? []);
  const mood: Mood = initial?.mood ?? "animado";
  const [duration, setDuration] = useState<Duration>(initial?.duration ?? "medio");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form
      className="space-y-10"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!sel.length) return setErr("Escolha pelo menos um gênero");
        setErr(null);
        setBusy(true);
        try {
          await onSubmit({ genres: sel, mood, duration });
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset>
        <legend className="mb-1 font-display text-3xl tracking-wide">Gêneros favoritos</legend>
        <p className="mb-4 text-sm text-muted-foreground">Escolha quantos quiser.</p>
        {error && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os gêneros. Tente novamente.</p>}
        {isLoading && <p className="mb-3 text-sm text-muted-foreground">Carregando gêneros...</p>}
        {!isLoading && !error && genres?.length === 0 && <p className="text-sm text-destructive">Nenhum gênero foi retornado. Recarregue a página.</p>}
        <div className="flex flex-wrap gap-2">
          {isLoading && Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}
          {genres?.map((g) => {
            const on = sel.includes(g.id);
            return (
              <label
                key={g.id}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60",
                )}
              >
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(g.id)} />
                {on && <Check className="h-3.5 w-3.5" />}
                {g.name}
              </label>
            );
          })}
        </div>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </fieldset>


      <fieldset>
        <legend className="mb-4 font-display text-3xl tracking-wide">Duração preferida</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {DURATIONS.map((d) => (
            <label
              key={d}
              className={cn(
                "cursor-pointer rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
                duration === d ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/60",
              )}
            >
              <input type="radio" name="duration" className="sr-only" checked={duration === d} onChange={() => setDuration(d)} />
              <div className="font-medium">{DURATION_LABEL[d]}</div>
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" size="lg" disabled={busy}>{submitLabel}</Button>
    </form>
  );
}
