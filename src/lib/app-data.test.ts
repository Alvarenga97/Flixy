import { describe, expect, it } from "vitest";
import { saveMyProfile } from "./app-data.functions";

describe("App data access", () => {
  it("rejects a profile write without an authenticated request", async () => {
    await expect(
      saveMyProfile({
        data: {
          version: 1,
          genres: [28],
          mood: "animado",
          duration: "medio",
          updatedAt: new Date().toISOString(),
        },
      }),
    ).rejects.toThrow();
  });
});
