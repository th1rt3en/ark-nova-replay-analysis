import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
    const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
    return {
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" }, miniflare: { bindings: { INTERNAL_SECRET: "test-secret", CLOUD_RUN_URL: "", TEST_MIGRATIONS: migrations } } })],
    };
});
