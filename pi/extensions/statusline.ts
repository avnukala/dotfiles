import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import * as path from "node:path";

const formatTokens = (n: number) => (n < 1000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(2)}M`);

export default function (pi: ExtensionAPI) {
	let responseStartMs: number | undefined;
	let outputTokens = 0;
	let durationMs = 0;

	pi.on("message_start", async (event) => {
		if (event.message.role === "assistant") responseStartMs = Date.now();
	});

	pi.on("message_end", async (event) => {
		if (event.message.role !== "assistant" || responseStartMs === undefined) return;
		outputTokens += (event.message as AssistantMessage).usage.output;
		durationMs += Date.now() - responseStartMs;
		responseStartMs = undefined;
	});

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		outputTokens = 0;
		durationMs = 0;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					let input = 0;
					let output = 0;
					let cost = 0;
					for (const entry of ctx.sessionManager.getBranch()) {
						if (entry.type !== "message") continue;
						// Subagent spend rides on tool results (subagents.json `reportUsage`).
						const { role } = entry.message;
						if (role !== "assistant" && role !== "toolResult") continue;
						const usage = (entry.message as AssistantMessage).usage;
						if (!usage) continue;
						// Anthropic reports cached prompt tokens apart from `input`, so count them as input too.
						input += usage.input + usage.cacheRead + usage.cacheWrite;
						output += usage.output;
						cost += usage.cost.total;
					}

					const model = `${ctx.model?.id ?? "no-model"} ${pi.getThinkingLevel()}`;
					const dir = path.basename(ctx.cwd) || ctx.cwd;
					const percent = ctx.getContextUsage()?.percent;
					const context = percent == null ? "ctx --" : `ctx ${percent.toFixed(1)}%`;
					const contextColor = percent == null || percent < 60 ? "success" : percent < 80 ? "warning" : "error";
					const tps = durationMs > 0 ? `${(outputTokens / (durationMs / 1000)).toFixed(1)} tps` : "-- tps";

					const statuses = [...footerData.getExtensionStatuses().values()].map((status) =>
						status.replace(/[\p{Extended_Pictographic}\uFE0F○]/gu, "").replace(/\s+/g, " ").trim(),
					);
					const line = [
						theme.fg("mdLink", model),
						theme.fg("mdLink", dir),
						theme.fg(contextColor, context),
						theme.fg("dim", `↑${formatTokens(input)}`),
						theme.fg("dim", `↓${formatTokens(output)}`),
						theme.fg("dim", tps),
						theme.fg("warning", `$${cost.toFixed(3)}`),
						...statuses,
					].join(theme.fg("borderMuted", " • "));
					return [truncateToWidth(line, width)];
				},
			};
		});
	});
}
