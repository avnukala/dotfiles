// Workspace spend persists after sessions close; cmux-progress.ts owns the progress label.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import { sessionCost } from "./lib/cost.ts";

const execute = promisify(execFile);

async function transaction(database: DatabaseSync, operation: () => Promise<void>): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      database.exec("BEGIN IMMEDIATE");
      break;
    } catch (error) {
      if ((error as { errcode?: number }).errcode !== 5 || attempt >= 100) throw error;
      await setTimeout(50);
    }
  }
  try {
    await operation();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export default function (pi: ExtensionAPI) {
  const workspaceId = process.env.CMUX_WORKSPACE_ID;
  if (!workspaceId) return;

  const cmux = process.env.CMUX_BUNDLED_CLI_PATH || "cmux";
  const directory = join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "pi", "cmux-cost");
  let pending = Promise.resolve();

  function push(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) return Promise.resolve();
    const sessionId = ctx.sessionManager.getSessionId();
    const entries = ctx.sessionManager.getEntries();
    pending = pending.then(async () => {
      const { usd } = await sessionCost(pi, ctx, entries);
      if (!Number.isFinite(usd) || usd < 0) throw new Error("Invalid Pi session cost");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const database = new DatabaseSync(join(directory, "cost.sqlite"));
      try {
        await transaction(database, async () => {
          database.exec(`CREATE TABLE IF NOT EXISTS session_cost (
            workspace_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            usd REAL NOT NULL CHECK (usd >= 0),
            PRIMARY KEY (workspace_id, session_id)
          )`);
          database.prepare(`INSERT INTO session_cost VALUES (?, ?, ?)
            ON CONFLICT (workspace_id, session_id) DO UPDATE SET usd = MAX(usd, excluded.usd)`)
            .run(workspaceId, sessionId, usd);
        });
        // Serialize the read and cmux update across concurrent Pi processes.
        await transaction(database, async () => {
          const total = database.prepare("SELECT SUM(usd) AS usd FROM session_cost WHERE workspace_id = ?")
            .get(workspaceId) as { usd: number };
          await execute(cmux, [
            "workspace-action", "set-description", "--workspace", workspaceId,
            "--description", `pi-cost:$${total.usd.toFixed(3)}`,
          ], { timeout: 5000 });
        });
      } finally {
        database.close();
      }
    }).catch((error) => {
      ctx.ui.notify(`Cannot update cmux cost: ${error instanceof Error ? error.message : String(error)}`, "warning");
    });
    return pending;
  }

  pi.on("session_start", async (_event, ctx) => {
    await push(ctx);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant" && event.message.role !== "toolResult") return;
    await push(ctx);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    await push(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await push(ctx);
  });
}
