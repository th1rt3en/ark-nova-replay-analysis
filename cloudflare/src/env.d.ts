// The bindings of wrangler.jsonc (and the secret), also for `import { env } from "cloudflare:workers"`.
declare namespace Cloudflare {
    interface Env {
        TABLE: DurableObjectNamespace<import("./table").Table>;
        COUNTER: DurableObjectNamespace<import("./counter").Counter>;
        DB: D1Database;
        INTERNAL_SECRET: string;
        CLOUD_RUN_URL: string;
        TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];                  // set by vitest.config.ts only
    }
}
interface Env extends Cloudflare.Env {}
