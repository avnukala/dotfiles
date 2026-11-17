import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import cmuxCost from "../extensions/cmux-cost.ts";

test("workspace spend retains closed sessions and counts resumed sessions once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cmux-cost-"));
  const previous = { ...process.env };
  const cli = join(directory, "cmux");
  const output = join(directory, "descriptions.jsonl");
  try {
    await writeFile(cli, `#!/usr/bin/env node
require("node:fs").appendFileSync(${JSON.stringify(output)}, JSON.stringify(process.argv.slice(2)) + "\\n");
`, { mode: 0o700 });
    process.env.CMUX_WORKSPACE_ID = "workspace-project";
    process.env.CMUX_BUNDLED_CLI_PATH = cli;
    process.env.XDG_STATE_HOME = directory;

    for (const [sessionId, amounts, expected] of [
      ["first", [0.2], "$0.200"],
      ["second", [0.3], "$0.500"],
      ["first", [0.2, 0.15], "$0.650"],
      ["first", [0.2, 0.15], "$0.650"],
      ["first", [], "$0.650"],
    ] as const) {
      const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void>>();
      const pi = {
        on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) => {
          handlers.set(name, handler);
        },
      } as unknown as ExtensionAPI;
      const entries = amounts.map((amount) => ({
        type: "message", message: { role: "assistant", usage: { cost: { total: amount } } },
      }));
      const ctx = {
        hasUI: true,
        sessionManager: { getSessionId: () => sessionId, getEntries: () => entries },
        ui: { notify: (message: string) => assert.fail(message) },
      } as unknown as ExtensionContext;
      cmuxCost(pi);
      await handlers.get("session_start")!({}, ctx);
      await handlers.get("session_shutdown")!({}, ctx);
      const descriptions = (await readFile(output, "utf8")).trim().split("\n");
      assert.equal(JSON.parse(descriptions.at(-1)!).at(-1), `pi-cost:${expected}`);
    }

    process.env.CMUX_WORKSPACE_ID = "workspace-other";
    const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void>>();
    cmuxCost({ on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) => {
      handlers.set(name, handler);
    } } as unknown as ExtensionAPI);
    await handlers.get("session_start")!({}, {
      hasUI: true,
      sessionManager: { getSessionId: () => "third", getEntries: () => [] },
      ui: { notify: (message: string) => assert.fail(message) },
    } as unknown as ExtensionContext);
    const database = new DatabaseSync(join(directory, "pi", "cmux-cost", "cost.sqlite"));
    try {
      const total = database.prepare("SELECT SUM(usd) AS usd FROM session_cost WHERE workspace_id = ?")
        .get("workspace-project")!.usd as number;
      assert.ok(Math.abs(total - 0.65) < 1e-9);
      assert.equal(database.prepare("SELECT SUM(usd) AS usd FROM session_cost WHERE workspace_id = ?")
        .get("workspace-other")!.usd, 0);
    } finally {
      database.close();
    }
  } finally {
    process.env = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
