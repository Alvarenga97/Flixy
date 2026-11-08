import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createResponsesCall } from "./ai/responses";
import { discoverAvailableMovies, getMovieExtrasById, listGenres } from "./tmdb.server";

const criteriaSchema = z.object({
  genreIds: z.array(z.number().int()),
  minRuntime: z.number(),
  maxRuntime: z.number(),
});
const choiceSchema = z.object({ movieId: z.number().int(), explanation: z.string() });

async function structuredCall<T>(request: Request, schema: z.ZodType<T>, instructions: string, prompt: string): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A recomendação inteligente não está configurada.");
  const result = createResponsesCall(request, {
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    model: "openai/gpt-6-astra",
  }, [{ role: "user", content: prompt }], instructions, schema);
  try {
    return await result.output;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) throw new Error("Não consegui montar uma recomendação. Tente descrever de outra forma.");
    const message = error instanceof Error ? error.message : "Não foi possível gerar a recomendação.";
    throw new Error(message);
  }
}

export async function recommendFromDescription(description: string, request: Request) {
  const genres = await listGenres();
  const genreGuide = genres.map((g) => `${g.id}: ${g.name}`).join(", ");
  const criteria = await structuredCall(
    request,
    criteriaSchema,
    "Você interpreta pedidos de filmes. Responda somente com os critérios estruturados solicitados.",
    `Pedido do espectador: "${description}"\n\nEscolha até 4 IDs de gêneros compatíveis da lista: ${genreGuide}. ` +
      "Se o pedido não indicar gênero, devolva genreIds vazio. Defina minRuntime e maxRuntime em minutos conforme o pedido; " +
      "sem preferência de duração use 0 e 9999. Não invente IDs.",
  );

  const validIds = new Set(genres.map((g) => g.id));
  const genreIds = criteria.genreIds.filter((id) => validIds.has(id)).slice(0, 4);
  let gte = Number.isFinite(criteria.minRuntime) ? Math.max(0, Math.min(9999, Math.floor(criteria.minRuntime))) : 0;
  let lte = Number.isFinite(criteria.maxRuntime) ? Math.max(0, Math.min(9999, Math.floor(criteria.maxRuntime))) : 9999;
  if (gte > lte) [gte, lte] = [0, 9999];

  let candidates = await discoverAvailableMovies({ genres: genreIds, gte, lte, match: "any", minVoteCount: 50, maxRandomPages: 8 });
  if (!candidates.length && (genreIds.length || gte !== 0 || lte !== 9999)) {
    candidates = await discoverAvailableMovies({ genres: [], gte: 0, lte: 9999, match: "any", minVoteCount: 100, maxRandomPages: 8 });
  }
  if (!candidates.length) return null;

  const genreNames = new Map(genres.map((g) => [g.id, g.name]));
  const shortlist = candidates.slice(0, 40).map((m) => ({
    id: m.id,
    title: m.title,
    year: m.release_date?.slice(0, 4) ?? "",
    rating: m.vote_average,
    genres: m.genre_ids.map((id) => genreNames.get(id)).filter(Boolean),
    overview: m.overview,
  }));
  const choice = await structuredCall(
    request,
    choiceSchema,
    "Você é o curador de filmes do Flixy. Escolha somente um filme da lista fornecida e explique a escolha em português do Brasil, de forma calorosa e específica, em até 80 palavras. Relacione a explicação ao pedido e à sinopse; não invente fatos nem mencione filmes fora da lista.",
    `Pedido do espectador: "${description}"\n\nFilmes disponíveis:\n${JSON.stringify(shortlist)}\n\n` +
      "Escolha o melhor filme para esse pedido. movieId deve ser exatamente um id da lista.",
  );
  const movie = candidates.find((m) => m.id === choice.movieId) ?? candidates[0]!;
  const extras = await getMovieExtrasById(movie.id);
  return {
    movie,
    siteUrl: movie.siteUrl,
    explanation: choice.explanation,
    ...extras,
  };
}
