// The id counter: one object that hands out the numbers of the table ids (E1, E2, ...). Allocation does not depend on BigQuery (docs/live_game_plan.md 9.2).
import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL)");
        ctx.storage.sql.exec("INSERT OR IGNORE INTO counter (id, n) VALUES (1, 0)");
    }

    /** The next number: one statement, so two callers can never get the same one. */
    next(): number {
        return this.ctx.storage.sql.exec<{ n: number }>("UPDATE counter SET n = n + 1 WHERE id = 1 RETURNING n").one().n;
    }

    /** After a loss of the counter: continue after `n` (the highest table number of the registry) unless it is already further. */
    ensureAtLeast(n: number): number {
        return this.ctx.storage.sql.exec<{ n: number }>("UPDATE counter SET n = MAX(n, ?) WHERE id = 1 RETURNING n", n).one().n;
    }
}
