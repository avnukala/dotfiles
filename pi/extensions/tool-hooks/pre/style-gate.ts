import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

const SKILLS_DIR = path.join(homedir(), ".config", "agents", "skills");
const STYLE = path.join(SKILLS_DIR, "style", "SKILL.md");
const STYLE_CODE = path.join(SKILLS_DIR, "style", "references", "code.md");
const STYLE_DOCS = path.join(SKILLS_DIR, "style", "references", "docs.md");
const SIMPLE_ENGLISH = path.join(SKILLS_DIR, "simple-english", "SKILL.md");

const PROSE_FILE = /\.(md|mdx|markdown|rst)$/i;
const DATA_FILE = /\.(json|jsonc|ya?ml|toml|lock|env|csv|tsv|ini|xml)$/i;
const CONFIG_DIRS = [path.join(homedir(), ".pi", "agent"), path.join(homedir(), ".config", "agents")];

function resolvePath(cwd: string, file: string): string {
	const absolute = path.resolve(cwd, file.replace(/^~(?=$|\/)/, homedir()));
	try {
		return realpathSync(absolute);
	} catch {
		return absolute;
	}
}

/** The style files that an edit or write to `file` needs, or none for data files and agent config. */
function requiredStyleFiles(file: string, cwd: string): string[] {
	if (DATA_FILE.test(file)) return [];
	const absolute = resolvePath(cwd, file);
	if (CONFIG_DIRS.some((dir) => absolute.startsWith(dir + path.sep))) return [];
	return PROSE_FILE.test(file) ? [STYLE, STYLE_DOCS, SIMPLE_ENGLISH] : [STYLE, STYLE_CODE];
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
 * Blocks `edit` and `write` calls until the matching style files are in the context: code rules for code,
 * docs rules and simple-english for prose.
 */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return undefined;

		const required = requiredStyleFiles(event.input.path as string, ctx.cwd);
		if (required.length === 0) return undefined;

		const loaded = loadedFiles(ctx);
		const missing = required.filter((file) => !loaded.has(realpathSync(file)));
		if (missing.length === 0) return undefined;
		return {
			block: true,
			reason: `Read these skill files with the read tool, follow them, then retry:\n${missing.join("\n")}`,
		};
	});
}
