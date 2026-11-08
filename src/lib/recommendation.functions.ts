import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const recommendMovie = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ description: z.string().trim().min(10, "Descreva um pouco mais o que quer assistir").max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const [{ recommendFromDescription }, { getRequest }] = await Promise.all([
      import("./recommendation.server"),
      import("@tanstack/react-start/server"),
    ]);
    return recommendFromDescription(data.description, getRequest());
  });
