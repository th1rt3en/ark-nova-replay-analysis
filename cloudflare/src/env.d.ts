// The bindings of wrangler.jsonc (and the secret), also for `import { env } from "cloudflare:workers"`.
declare namespace Cloudflare {
    interface Env {
        TABLE: DurableObjectNamespace<import("./table").Table>;
        COUNTER: DurableObjectNamespace<import("./counter").Counter>;
        INTERNAL_SECRET: string;
        CLOUD_RUN_URL: string;
    }
}
interface Env extends Cloudflare.Env {}
