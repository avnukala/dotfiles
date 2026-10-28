/**
 * Loads Claude Code `.claude/rules` for the files that the agent touches.
 *
 * The rules come from the nearest `.claude/rules` above each file, not from the launch
 * directory, so a session started in a superrepo still gets each worktree's rules.
 * A read gets the matching rules appended to its result. An edit or write that matches
 * rules the model has not seen yet is blocked once with the rules as the reason.
 * Rules without `paths:` frontmatter match every file under their root.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Rule = { file: string; globs: string[]; body: string };

function findRoot(file: string): string | undefined {
	let dir = path.dirname(file);
	while (!fs.existsSync(path.join(dir, ".claude", "rules"))) {
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
	return dir;
}

function parseGlobs(frontmatter: string): string[] {
	const lines = frontmatter.split("\n");
	const index = lines.findIndex((line) => /^paths\s*:/.test(line));
	if (index === -1) return [];
	const inline = lines[index].replace(/^paths\s*:/, "").trim();
	const rest = lines.slice(index + 1);
	const end = rest.findIndex((line) => !/^\s*-\s/.test(line));
	const items = inline
		? inline.replace(/^\[|\]$/g, "").split(/,(?![^{]*\})/)
		: rest.slice(0, end === -1 ? rest.length : end).map((line) => line.replace(/^\s*-\s/, ""));
	return items.map((item) => item.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

function loadRules(root: string): Rule[] {
	const dir = path.join(root, ".claude", "rules");
	const names = (fs.readdirSync(dir, { recursive: true }) as string[]).filter((name) => name.endsWith(".md")).sort();
	return names.map((name) => {
		const file = path.join(dir, name);
		const content = fs.readFileSync(file, "utf8");
		const match = content.match(/^---\n([\s\S]*?)\n---\n/);
		return { file, globs: match ? parseGlobs(match[1]) : [], body: match ? content.slice(match[0].length) : content };
	});
}

function applies(rule: Rule, rel: string): boolean {
	if (rule.globs.length === 0) return true;
	return rule.globs.some((glob) => path.matchesGlob(rel, glob.includes("/") ? glob : `**/${glob}`));
}

function render(root: string, rules: Rule[]): string {
	const sections = rules.map((rule) => {
		const scope = rule.globs.length > 0 ? rule.globs.join(", ") : "all files";
		return `### ${path.relative(root, rule.file)} (applies to: ${scope})\n\n${rule.body.trim()}`;
	});
	return `<project-rules root="${root}">\nFollow these rules for files under ${root}.\n\n${sections.join("\n\n")}\n</project-rules>`;
}

export default function claudeRules(pi: ExtensionAPI) {
	const sent = new Set<string>();
	const readRules = new Map<string, string>();

	function claim(cwd: string, target: string): string | undefined {
		const file = path.resolve(cwd, target.replace(/^@/, ""));
		const root = findRoot(file);
		if (!root) return undefined;
		const rel = path.relative(root, file);
		const rules = loadRules(root).filter((rule) => !sent.has(rule.file) && applies(rule, rel));
		if (rules.length === 0) return undefined;
		for (const rule of rules) sent.add(rule.file);
		return render(root, rules);
	}

	pi.on("session_start", () => {
		sent.clear();
		readRules.clear();
	});

	pi.on("session_compact", () => sent.clear());

	pi.on("tool_call", (event, ctx) => {
		const target = event.input.path;
		if (typeof target !== "string") return;
		if (event.toolName === "read") {
			const text = claim(ctx.cwd, target);
			if (text) readRules.set(event.toolCallId, text);
			return;
		}
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const text = claim(ctx.cwd, target);
		if (!text) return;
		return { block: true, reason: `Project rules apply to ${target}. Follow them, then retry the ${event.toolName}.\n\n${text}` };
	});

	pi.on("tool_result", (event) => {
		const text = readRules.get(event.toolCallId);
		if (!text) return;
		readRules.delete(event.toolCallId);
		return { content: [...event.content, { type: "text", text }], structuredContent: event.structuredContent };
	});
}
