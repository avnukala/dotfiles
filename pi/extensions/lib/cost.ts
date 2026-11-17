// Session spend for the pi statusline and the cmux sidebar. Cursor bills outside pi's message usage, so it reads the cursor-sdk ledger.

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type SessionCost = { usd: number };

type CursorUsageView = {
  agents: {
    aggregateOnlyCost?: { chargedCents: number };
    latestAggregate?: { cost?: { chargedCents: number } };
    wholeAgent?: { cost?: { chargedCents: number } };
    costReconciliation?: string;
  }[];
  correctedRawTotal: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

type LedgerModule = { readCursorUsageView: (pi: unknown, ctx: ExtensionContext) => CursorUsageView };

const LEDGER = join(homedir(), ".pi/agent/npm/node_modules/pi-cursor-sdk/dist/cursor-usage-ledger.js");
let ledger: Promise<LedgerModule> | undefined;

function loadLedger(): Promise<LedgerModule> {
  if (!ledger) ledger = import(pathToFileURL(LEDGER).href) as Promise<LedgerModule>;
  return ledger;
}

function branchMessageUsd(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>): number {
  let usd = 0;
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const { role } = entry.message;
    if (role !== "assistant" && role !== "toolResult") continue;
    const usage = (entry.message as AssistantMessage).usage;
    if (!usage) continue;
    usd += usage.cost.total;
  }
  return usd;
}

function branchUsesCursor(ctx: ExtensionContext, entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>): boolean {
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    if ((entry.message as AssistantMessage).provider === "cursor") return true;
  }
  return ctx.model?.provider === "cursor";
}

function estimateCursorUsd(view: CursorUsageView, ctx: ExtensionContext): number {
  const rates = ctx.model?.cost;
  if (!rates) return 0;
  const t = view.correctedRawTotal;
  return (
    (t.inputTokens * rates.input +
      t.outputTokens * rates.output +
      t.cacheReadTokens * (rates.cacheRead ?? 0) +
      t.cacheWriteTokens * (rates.cacheWrite ?? 0)) /
    1_000_000
  );
}

function cursorBilledUsd(view: CursorUsageView): { usd: number; hasBilled: boolean } {
  let usd = 0;
  let hasBilled = false;
  for (const agent of view.agents) {
    if (agent.costReconciliation === "inconsistent") continue;
    const cost = agent.aggregateOnlyCost ?? agent.latestAggregate?.cost ?? agent.wholeAgent?.cost;
    if (cost?.chargedCents == null) continue;
    usd += cost.chargedCents / 100;
    hasBilled = true;
  }
  return { usd, hasBilled };
}

export async function sessionCost(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  entries = ctx.sessionManager.getBranch(),
): Promise<SessionCost> {
  const messageUsd = branchMessageUsd(entries);
  if (!branchUsesCursor(ctx, entries)) return { usd: messageUsd };

  try {
    const { readCursorUsageView } = await loadLedger();
    const view = readCursorUsageView(pi, ctx);
    const billed = cursorBilledUsd(view);
    if (billed.hasBilled && billed.usd >= messageUsd) return { usd: billed.usd };
    const estimated = estimateCursorUsd(view, ctx);
    if (estimated > messageUsd) return { usd: estimated };
    if (billed.hasBilled && billed.usd > messageUsd) return { usd: billed.usd };
  } catch {
    // Ledger missing while cursor-sdk is still starting.
  }
  return { usd: messageUsd };
}
