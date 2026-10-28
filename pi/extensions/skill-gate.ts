import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

const SKILLS_DIR = path.join(homedir(), ".config", "agents", "skills");
const STYLE = path.join(SKILLS_DIR, "style", "SKILL.md");
const STYLE_CODE = path.join(SKILLS_DIR, "style", "references", "code.md");
const STYLE_DOCS = path.join(SKILLS_DIR, "style", "references", "docs.md");
const STYLE_BRANCHES = path.join(SKILLS_DIR, "style", "references", "branches.md");
const STYLE_COMMITS = path.join(SKILLS_DIR, "style", "references", "commits.md");
const STYLE_PRS = path.join(SKILLS_DIR, "style", "references", "prs.md");
const SIMPLE_ENGLISH = path.join(SKILLS_DIR, "simple-english", "SKILL.md");
const CHECKER = path.join(SKILLS_DIR, "simple-english", "scripts", "check.py");

const PROSE_FILE = /\.(md|mdx|markdown|rst)$/i;
const DATA_FILE = /\.(json|jsonc|ya?ml|toml|lock|env|csv|tsv|ini|xml)$/i;
const CONFIG_DIRS = [path.join(homedir(), ".pi", "agent"), path.join(homedir(), ".config", "agents")];
const COMMIT_COMMAND = /\bgit\b[^|;&]*\bcommit\b/;
const BRANCH_COMMAND = /\bgit\b[^|;&]*\b(checkout\s+-[bB]|switch\s+-[cC]|branch\s+(?!-)[^\s|;&]|worktree\s+add\b[^|;&]*\s-[bB]\b)/;
const PR_COMMAND = /\bgh\s+pr\s+(create|edit)\b/;
// The checker's `vocab` warnings flag most technical words, so only the warnings the style says to fix reach the model.
const CHECKER_FINDING = /: (error \w+|warn (passive|adverb|wording)):/;

function resolvePath(cwd: string, file: string): string {
	const absolute = path.resolve(cwd, file.replace(/^~(?=$|\/)/, homedir()));
	try {
		return realpathSync(absolute);
	} catch {
		return absolute;
	}
}

function requiredSkillFiles(toolName: string, input: Record<string, unknown>, cwd: string): string[] {
	if (toolName === "edit" || toolName === "write") {
		const file = input.path as string;
		if (DATA_FILE.test(file)) return [];
		const absolute = resolvePath(cwd, file);
		if (CONFIG_DIRS.some((dir) => absolute.startsWith(dir + path.sep))) return [];
		if (PROSE_FILE.test(file)) return [STYLE, STYLE_DOCS, SIMPLE_ENGLISH];
		return [STYLE, STYLE_CODE];
	}
	const command = toolName === "bash" ? input.command : toolName === "terminal" ? (input.command ?? input.input) : undefined;
	if (typeof command !== "string") return [];

	const required = new Set<string>();
	if (BRANCH_COMMAND.test(command)) [STYLE, STYLE_BRANCHES].forEach((file) => required.add(file));
	if (COMMIT_COMMAND.test(command)) [STYLE, STYLE_COMMITS, STYLE_DOCS].forEach((file) => required.add(file));
	if (PR_COMMAND.test(command)) [STYLE, STYLE_PRS, STYLE_DOCS, SIMPLE_ENGLISH].forEach((file) => required.add(file));
	return [...required];
}

/** Files that a successful `read` call put in the current model context, which excludes compacted history. */
function loadedFiles(ctx: ExtensionContext): Set<string> {
	const readPaths = new Map<string, string>();
	const succeeded = new Set<string>();
	for (const entry of ctx.sessionManager.buildContextEntries()) {
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role === "toolResult" && !message.isError) succeeded.add(message.toolCallId);
		if (message.role !== "assistant") continue;
		for (const block of message.content) {
			if (block.type === "toolCall" && block.name === "read") readPaths.set(block.id, block.arguments.path as string);
		}
	}
	const loaded = new Set<string>();
	for (const [id, file] of readPaths) {
		if (succeeded.has(id)) loaded.add(resolvePath(ctx.cwd, file));
	}
	return loaded;
}

/**
 * Blocks edits, commits, branch creation, and PR text until the matching style and simple-english files are read,
 * then runs the simple-english checker on each edited prose file.
 */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		const required = requiredSkillFiles(event.toolName, event.input, ctx.cwd);
		if (required.length === 0) return undefined;

		const loaded = loadedFiles(ctx);
		const missing = required.filter((file) => !loaded.has(realpathSync(file)));
		if (missing.length === 0) return undefined;
		return {
			block: true,
			reason: `Read these skill files with the read tool, follow them, then retry:\n${missing.join("\n")}`,
		};
	});

	pi.on("tool_result", async (event, ctx) => {
		if ((event.toolName !== "edit" && event.toolName !== "write") || event.isError) return undefined;
		const file = event.input.path as string;
		if (!PROSE_FILE.test(file)) return undefined;

		const result = await pi.exec("python3", [CHECKER, resolvePath(ctx.cwd, file)]);
		const findings = result.stdout.split("\n").filter((line) => CHECKER_FINDING.test(line));
		if (findings.length === 0) return undefined;
		const report = `simple-english checker findings. Fix the ones in text you wrote:\n${findings.join("\n")}`;
		return { content: [...event.content, { type: "text", text: report }] };
	});
}
