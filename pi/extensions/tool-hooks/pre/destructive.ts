import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import * as path from "node:path";

const DESTRUCTIVE_COMMANDS = [
	/\bmkfs\b/,
	/\bdd\s+if=\/dev\/zero\b/,
	/\b(shutdown|reboot)\b/,
];

const VALON = path.join(homedir(), "valon");
const RM_COMMAND = /(?:^|[;&|(]|\s)rm\s+[^;&|]*/g;

function rmOutsideValon(command: string, cwd: string): boolean {
	for (const match of command.match(RM_COMMAND) ?? []) {
		const args = match.trim().split(/\s+/).slice(1).map((a) => a.replace(/^["']|["']$/g, ""));
		const targets = args.filter((a) => !a.startsWith("-"));
		for (const target of targets) {
			if (/[$`*?[{]/.test(target.replace(/^~(?=\/)/, ""))) return true;
			const resolved = path.resolve(cwd, target.replace(/^~(?=$|\/)/, homedir()));
			if (resolved !== VALON && !resolved.startsWith(VALON + path.sep)) return true;
		}
	}
	return false;
}

/** Asks the user before `rm` outside ~/valon and before disk or power commands. Blocks when no UI is attached. */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		const command = event.toolName === "bash" ? event.input.command : event.toolName === "terminal" ? (event.input.command ?? event.input.input) : undefined;
		if (typeof command !== "string") return undefined;

		const kind = rmOutsideValon(command, ctx.cwd) ? "rm outside ~/valon" : DESTRUCTIVE_COMMANDS.some((pattern) => pattern.test(command)) ? "destructive command" : undefined;
		if (!kind) return undefined;
		if (!ctx.hasUI) return { block: true, reason: `Blocked: ${kind} needs user approval` };
		if (await ctx.ui.confirm(`Allow ${kind}?`, command)) return undefined;
		return { block: true, reason: "Blocked by user" };
	});
}
