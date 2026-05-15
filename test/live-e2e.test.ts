import { describe, expect, test } from "vitest";

describe("live e2e", () => {
  test.skipIf(process.env.STARK_RUN_LIVE_E2E !== "1")(
    "requires Linear credentials and a real Codex app-server environment",
    () => {
      expect(process.env.LINEAR_API_KEY).toBeTruthy();
    },
  );
});
