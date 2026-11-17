import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

const VALON_DIR = path.join(homedir(), "valon");
const PEACH = "front_porch/modules/peach/cli/peach";
const GQL_FILE = /^web\/.*(gql\.ts|graphql\.ts|\.graphql)$/;
const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT = 4000;

/**
 * Runs `peach gql` and `peach fmt` at the end of each run on front-porch files that pi edited under ~/valon.
 */
export default function (pi: ExtensionAPI) {
	const editedFiles = new Map<string, Set<string>>();
	let reported = false;

	pi.on("before_agent_start", async () => {
		reported = false;
	});

	pi.on("tool_result", async (event, ctx) => {
		if ((event.toolName !== "edit" && event.toolName !== "write") || event.isError) return;
		const file = path.resolve(ctx.cwd, (event.input.path as string).replace(/^~(?=$|\/)/, homedir()));
		if (!file.startsWith(VALON_DIR + path.sep)) return;

		const { stdout, code } = await pi.exec("git", ["-C", path.dirname(file), "rev-parse", "--show-toplevel"]);
		const root = stdout.trim();
		if (code !== 0 || !existsSync(path.join(root, PEACH))) return;

		const files = editedFiles.get(root) ?? new Set<string>();
		files.add(path.relative(root, file));
		editedFiles.set(root, files);
	});

	pi.on("agent_before_settle", async (event, ctx) => {
		if (event.outcome !== "completed" || editedFiles.size === 0) return;
		const roots = [...editedFiles];
		editedFiles.clear();

		const failures: string[] = [];
		for (const [root, files] of roots) {
			const existing = [...files].filter((file) => existsSync(path.join(root, file)));
			if (existing.some((file) => GQL_FILE.test(file))) {
				failures.push(...(await runPeach(root, ["gql"])));
			}
			const formattable = existing.filter((file) => file.endsWith(".py") || file.startsWith("web/"));
			if (formattable.length > 0) {
				failures.push(...(await runPeach(root, ["fmt", ...formattable])));
			}
		}
		if (ctx.hasUI) ctx.ui.setStatus("valon", undefined);
		if (failures.length === 0) return;

		const content = `Peach failed after your edits. Fix the cause.\n\n${failures.join("\n\n")}`;
		const continueRun = !reported;
		reported = true;
		return { entries: [{ type: "custom_message", customType: "valon-peach", content, display: true }], continue: continueRun };

		async function runPeach(root: string, args: string[]): Promise<string[]> {
			if (ctx.hasUI) ctx.ui.setStatus("valon", `peach ${args[0]}…`);
			const result = await pi.exec(path.join(root, PEACH), args, { cwd: root, timeout: TIMEOUT_MS });
			if (result.code === 0) return [];
			const output = `${result.stdout}\n${result.stderr}`.trim().slice(-MAX_OUTPUT);
			return [`\`peach ${args.join(" ")}\` in ${root} exited with code ${result.code}:\n${output}`];
		}
	});
}
