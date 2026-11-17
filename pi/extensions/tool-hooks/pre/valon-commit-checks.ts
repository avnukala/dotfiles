import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

const VALON_DIR = path.join(homedir(), "valon");
const PEACH = "front_porch/modules/peach/cli/peach";
const GIT_COMMIT = /(?:^|[;&|(])\s*git\s+(?:-C\s+(\S+)\s+)?commit(?![\w-])/;
const CHECKS = [
	["check", "--changed", "--lint"],
	["check", "--changed", "--fast"],
];
const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT = 4000;

/**
 * Blocks `git commit` under ~/valon until peach lint and fast checks pass on the changed files.
 */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		const command =
			event.toolName === "bash"
				? event.input.command
				: event.toolName === "terminal"
					? (event.input.command ?? event.input.input)
					: undefined;
		if (typeof command !== "string") return undefined;

		const match = GIT_COMMIT.exec(command);
		if (!match) return undefined;
		const dir = path.resolve(ctx.cwd, (match[1] ?? ".").replace(/^["']|["']$/g, "").replace(/^~(?=$|\/)/, homedir()));
		if (dir !== VALON_DIR && !dir.startsWith(VALON_DIR + path.sep)) return undefined;

		const { stdout, code } = await pi.exec("git", ["-C", dir, "rev-parse", "--show-toplevel"]);
		const root = stdout.trim();
		if (code !== 0 || !existsSync(path.join(root, PEACH))) return undefined;

		const failures: string[] = [];
		for (const args of CHECKS) {
			if (ctx.hasUI) ctx.ui.setStatus("valon", `peach ${args.slice(1).join(" ")}…`);
			const result = await pi.exec(path.join(root, PEACH), args, { cwd: root, timeout: TIMEOUT_MS });
			if (result.code === 0) continue;
			const output = `${result.stdout}\n${result.stderr}`.trim().slice(-MAX_OUTPUT);
			failures.push(`\`peach ${args.join(" ")}\` in ${root} exited with code ${result.code}:\n${output}`);
		}
		if (ctx.hasUI) ctx.ui.setStatus("valon", undefined);
		if (failures.length === 0) return undefined;

		return {
			block: true,
			reason: `Commit blocked: peach checks failed. Fix the causes, then commit again.\n\n${failures.join("\n\n")}`,
		};
	});
}
