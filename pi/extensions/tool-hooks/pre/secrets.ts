import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import * as path from "node:path";

const AUTH_FILE = path.join(homedir(), ".pi", "agent", "auth.json");

const AUTH_FILE_COMMAND = /\.pi\/agent\/auth\.json/;

const GESTALT_SECRET_COMMANDS = [
	/(^|[|;&(` ])\s*\b(echo|printf|cat|print|declare)\b.*\bgestalt.*(key|secret|token|password|credential)/i,
	/(^|[|;&(` ])\s*\b(env|printenv)\b.*\bgestalt/i,
	// Bare `set` prints every variable; `set -e` and friends do not.
	/(^|[|;&(` ])\s*\bset\b(?!\s+[-+]).*\bgestalt/i,
];

function isSecretPath(file: string): boolean {
	if (file === AUTH_FILE) return true;
	if (/^\.env(\.(?!example$|sample$|template$).+)?$/.test(path.basename(file))) return true;
	return file.split(path.sep).some((part) => part === ".secrets" || part === "credentials");
}

/** Blocks reads of secret files and bash commands that would print pi or Gestalt credentials. */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "read") {
			const file = path.resolve(ctx.cwd, (event.input.path as string).replace(/^~(?=$|\/)/, homedir()));
			if (isSecretPath(file)) return { block: true, reason: `Blocked: ${file} may hold secrets` };
			return undefined;
		}

		const command = event.toolName === "bash" ? event.input.command : event.toolName === "terminal" ? (event.input.command ?? event.input.input) : undefined;
		if (typeof command !== "string") return undefined;

		if (AUTH_FILE_COMMAND.test(command)) return { block: true, reason: "Blocked: command may expose pi credentials" };
		if (GESTALT_SECRET_COMMANDS.some((pattern) => pattern.test(command))) {
			return { block: true, reason: "Blocked: command may expose Gestalt secrets" };
		}
		return undefined;
	});
}
