/**
 * Connects pi sessions to the notes vault in ~/valon/vault through the `vault` CLI.
 *
 * At session start, `vault context` prints the vault rules, the session's workstream, and the checkpoint and worktrees of its ticket. The block goes into the `notes-vault` system
 * prompt section and keeps the same bytes until the workstream changes or the session compacts, so the prompt cache stays valid. `/checkpoint` asks the agent to update the
 * checkpoint, and the extension suggests it after each 12 user turns without a checkpoint write.
 * Vault files that pi edits are committed after each run. Writes to Arijit's zones are blocked once.
 *
 * A brief can hold a `## Rules for code` section and a `paths` list of code folders. The first read,
 * search, or command that touches one of those folders gets the rules appended to its result, and the
 * first edit or write there is blocked once with the rules as the reason. The rules of the session's
 * own workstream are already in the `notes-vault` block, so they are not sent again.
 *
 * Lessons live as one-line entries in ~/.config/agents/MEMORY.md, for all work, and ~/valon/MEMORY.md, for sessions under ~/valon.
 * At session start, the files that apply go into the `memory` system prompt section. Like `notes-vault`, the section keeps
 * the same bytes until the session compacts. pi applies each edit or write to a memory file with its own matching. Then the
 * new file is checked for secrets and the 50-line limit, and Arijit approves the diff. A failed check, a decline, or a session
 * without a UI puts the old file back and returns an error.
 *
 * Agents seldom add a line on their own, so the extension also reflects. A cheap score of each new turn (push-back words, repeats,
 * reverts) and of each review comment that watch-pr logged decides when. Haiku reads a digest of the whole new turns, with the review
 * comments and what the agent did about them, and lists lessons with a weight. A second Haiku call merges the lessons into the memory
 * files as numbered line operations, and Arijit approves each diff. A session without a UI keeps the digest in a spool file for the next
 * session that has one. See capture.ts for the score, the digest, and the trigger rules.
 */

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { type ExtensionAPI, type ExtensionContext, generateDiffString } from "@earendil-works/pi-coding-agent";
import { digest, joinWatchFiles, novel, parseLessons, reviewPoints, reviewUnit, shouldReflect, signals, withRepeats, type Review, type Turn } from "./capture.ts";

// VAULT_DIR points tests at a snapshot of the vault. The CLI reads the same variable.
const VAULT = process.env.VAULT_DIR || path.join(homedir(), "valon", "vault");
const WORKSTREAMS = path.join(VAULT, "workstreams");
const CLI = path.join(homedir(), ".config", "agents", "bin", "vault");
const SECTION = "notes-vault";
const BINDING_ENTRY = "vault-binding";
const OWNER_ZONES = new Set(["bases"]);
const VALON = path.join(homedir(), "valon");
// Each memory file, by real path so that edits through a symlink match, with the folder whose sessions load it and its label in reflection prompts.
const MEMORY_FILES = new Map([
	[realPath(path.join(homedir(), ".config", "agents", "MEMORY.md")), { scope: path.parse(homedir()).root, label: "global" }],
	[realPath(path.join(VALON, "MEMORY.md")), { scope: VALON, label: "valon" }],
]);
const MEMORY_SECTION = "memory";
const MEMORY_LIMIT = 50;
const REFLECT_ENTRY = "memory-reflect";
const REFLECT_EVERY = 12;
const REFLECT_PROVIDER = "anthropic";
const REFLECT_MODEL = "claude-haiku-5-5";
const REVIEW_ENTRY = "memory-review";
const STATE_FILE = path.join(homedir(), ".pi", "agent", "memory-state.json");
const DECISIONS_FILE = path.join(homedir(), ".pi", "agent", "memory-decisions.jsonl");
const STATE_LOCK_STALE_MS = 30_000;
const STATE_LOCK_TIMEOUT_MS = 20_000;
const WATCH_DIR = path.join(homedir(), ".cache", "watch-pr");
const SEEN_LIMIT = 800;
const HISTORY_LIMIT = 150;
const LESSON_LIMIT = 100;
const SPOOL_LIMIT = 6;
const SPOOL_CLIP = 12_000;

const EXTRACT_PROMPT = `You find lessons for coding agents that work for Arijit. You read part of a session as a digest. Each turn has Arijit's message, the end of the agent's reply, errors, and REVIEW lines. A REVIEW line is a comment that a reviewer left on Arijit's own PR, with what the agent did about it. Save a lesson when Arijit pushed back on something an agent made or did, or when a reviewer asked for a change that an agent would make again in a new session.

Arijit rarely says "remember this". Look for:
- Doubt about something the agent added: "Why do we need X?", "Do we really need X?", "Can we drop X?". If X is later dropped, merged, or renamed, the agent added something it could not justify.
- A better name or place: "Shouldn't we call this Y?", "move it to tests", "rename X to Y".
- A cut: "too much", "remove this", "shorter", "drop it", "revert".
- Reuse: "use the existing Y", "is there a pattern for this already".
- A process rule: "don't run X", "ask me here", "never do Y in replies", "plan before you change Z".
- Frustration, profanity, "???", or the same push-back more than once. Repeats are the most important lessons.
- Knowledge Arijit had to supply: "do you remember", "I told you", "check X in my .zshrc". Save where the data, file, or tool lives.
- A standing preference inside a task request: "do not X", "never X", "always Y", "keep it minimal". It counts if it would apply to the next task too.

Reviews that Arijit received are first-class feedback:
- A human reviewer's comment that the agent fixed ("-> fixed") is a lesson. Write the kind of mistake, not the one fix.
- A comment that the agent declined ("-> declined") is a lesson only if the reply shows a rule, such as "keep X because Y".
- The same kind of finding from a reviewer or from Bugbot on more than one PR or thread is the most important lesson. A REVIEW line can end with "REPEAT on PR n" or "REPEAT on this PR", which shows the same finding earlier. Give it w3.
- A reviewer's reminder of a step before merge, such as "run this migration in dev", is a process rule. Save it.
- A Bugbot finding about one bug in one piece of code is not a lesson. Save it only when it is a kind of mistake that agents repeat, such as a test that mocks, a date in the wrong time zone, or an unbounded query.
- A reviewer's question about the domain, a nit with no rule behind it, and a thread that is still open are not lessons.
- When Arijit writes a review on someone else's PR, his findings are about that code. From such a review, save only how he wants review comments written.

Each lesson must come from Arijit's words or from a REVIEW line, not from the agent's reply alone. Each rule must name a concrete thing: a column, table, comment, name, helper, test run, commit message, prod action, or subagent. Do not write vague rules such as "verify the state", "answer directly", or "confirm scope".

Arijit wants agents to act on their own for routine work. Do not turn one push-back into a general "ask first" or "wait for approval" rule. Write such a rule only if Arijit asked for approval himself.

Not a lesson: one-time steps ("continue", "commit and push", "use subagents for this"), status or explanation requests, domain facts the code shows, and harness errors such as a skill gate or a blocked command.

How to write each lesson:
- One level more general than the case, so it applies to the next table, comment, PR, or task.
- Merge push-backs and review comments that share a cause into one line. Five comment cuts are one lesson about comments.
- Imperative, at most 20 words, then the case in at most 6 words.
- Give a weight: w3 for a repeat, a revert, strong language, an explicit "remember", or a mistake that cost a rework. w2 for one clear correction. w1 for a minor taste point.

Format: at most 6 lines. Each line starts with a dash, the scope in brackets, and the weight in brackets, like this:
- [valon] [w2] Spell out names in code (e.g. FreddieResponse not FreddieRsp)
Output only these lines, with no other text and no reasoning.
global = any repository. valon = front-porch and other Valon repositories.
If there is no lesson, output exactly NONE.`;

const MERGE_PROMPT = `You maintain two memory files for coding agents that work for Arijit. Agents read the files at the start of every session, so every word costs tokens in every session. You get the current files with numbered lines and candidate lessons from a recent session. Change the files only where a candidate earns it.

What earns a line:
- A mistake Arijit corrected, most of all one he corrected more than once or that cost a revert or a dropped change.
- A fact he had to supply that agents will need again, such as where data or a tool lives.
Each candidate has a weight. w3 is a repeat or a rework and earns a line first. A w1 candidate earns a line only by updating a line that covers the same area.
Drop a candidate that is vague, a one-off detail of one task, or already covered. Also drop a candidate about how the agent talks: status reports, summaries, shortening text, following an instruction it was just given, or running the tool it was told to run. Those are not habits of code.
The best lines change the code an agent writes: data models, names, comments, reuse of existing code, file placement, tests, git, and prod safety.
Arijit wants agents to act on their own for routine work. Drop a candidate that adds a general "ask first" or "wait for approval" step.

Which file:
- valon: anything about front-porch, Valon repositories, peach, CI, migrations, tables, GSE, Fannie, Freddie, SFTP, Linear, or Valon tools.
- global: habits that hold in any repository, such as comments, names, tests, commits, PR replies, and subagents.

How to write a line. Copy the voice of these lines:
- ServiceMac is tenant 9.
- Docstrings are one sentence. No comment restates a type or a position.
- Add a column only when code reads it now (e.g. no \`content_hash\`).
- Tell each subagent: no local test runs, send questions back.
Rules:
- One rule per line. Short plain sentences, at most 20 words, plus an optional example of at most 6 words in parentheses.
- State the end state an agent can check in its own output. Name the exact identifier, helper, command, or path.
- The example shows the right thing, or "not" the wrong thing. Never only the wrong thing.
- No semicolons, no contractions, no "Arijit", no story of what happened, no dates or sources.
- If a candidate fits an existing line, update that line instead of adding one. Keep the meaning of each existing line, because Arijit approved it. You may shorten it.
- Lines marked [fixed] are Arijit's own. Never update or delete them. Skip a candidate that one of them covers.

Fewer is better: do not fill the space. The hard limit is ${MEMORY_LIMIT} lines in each file. Never delete a useful line to make room. When a file has 12 or more lines, add a line only for a correction Arijit repeated or one that cost a revert, and make room by merging two related lines into one.

Output only operations, one per line, or exactly NO_CHANGE:
ADD global|valon: <line>
UPDATE <n>: <line>
DELETE <n>`;
// Same pattern as SENSITIVE in the vault CLI: cloud keys, tokens, private keys, JWTs, and SSNs.
const SENSITIVE =
	/AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.|\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/;
const TICKET = /^[a-z]+-\d+$/i;

type Binding = { ws?: string; ticket?: string };
type MemoryLine = { label: string; text: string };
type Run = { calls: number; input: number; output: number; cost: number; lessons: string[]; operations: string[] };
type SpoolEntry = { id: string; text: string; at: string };
type State = { seen: Record<string, string>; lessons: string[]; history: Review[]; spool: SpoolEntry[] };
type WorkstreamRules = { ws: string; paths: string[]; rules: string };

function resolve(cwd: string, target: string): string {
	return path.resolve(cwd, target.replace(/^@/, "").replace(/^~(?=$|\/)/, homedir()));
}

function workstreams(): string[] {
	return readdirSync(WORKSTREAMS, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

function guard(rel: string, file: string, warned: Set<string>): string | undefined {
	const zone = rel.split(path.sep)[0];
	if (zone === ".obsidian" || zone === ".git") return `Agents never write \`${zone}/\` in the notes vault.`;
	const ownerZone = OWNER_ZONES.has(zone) || !rel.includes(path.sep);
	if (!ownerZone || warned.has(file)) return undefined;
	warned.add(file);
	return `\`${rel}\` is in Arijit's zone of the notes vault. Write it only if Arijit asked for this change in his latest message. If he did, retry the same call.`;
}

/** Resolves symlinks such as ~/valon/CLAUDE.md. A new file resolves through its parent folder. */
function realPath(file: string): string {
	try {
		return realpathSync(file);
	} catch {
		try {
			return path.join(realpathSync(path.dirname(file)), path.basename(file));
		} catch {
			return file;
		}
	}
}

function readText(file: string): string | undefined {
	return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

function memoryFilesFor(cwd: string) {
	return [...MEMORY_FILES].filter(([, { scope }]) => cwd === scope || cwd.startsWith(scope.endsWith(path.sep) ? scope : scope + path.sep));
}

/** The memory files that apply to sessions in `cwd`, each with its path so the agent knows where to add a line. */
function memoryBlock(cwd: string): string {
	return memoryFilesFor(cwd)
		.flatMap(([file]) => {
			const text = readText(file)?.trim();
			return text ? [`From ${file}:\n${text}`] : [];
		})
		.join("\n\n");
}

/** Returns why the new memory file must not stay, or undefined once Arijit approves its diff. */
async function reviewMemory(file: string, before: string, after: string, ctx: ExtensionContext): Promise<string | undefined> {
	if (SENSITIVE.test(after)) return `The new text of ${file} looks like it holds a secret or an SSN. Remove it and retry.`;
	const count = after.split("\n").filter((line) => line.startsWith("- ")).length;
	if (count > MEMORY_LIMIT) return `${file} would have ${count} lines. The limit is ${MEMORY_LIMIT}. Merge or replace a line in the same edit, then retry.`;
	if (!ctx.hasUI) return `Arijit must approve each change to ${file}, and no one can answer in this session. Do not retry. Put the proposed line in your final reply.`;
	const { diff } = generateDiffString(before, after, 1);
	const approved = await ctx.ui.confirm(`Approve this change to ${file}?`, diff);
	return approved ? undefined : `Arijit declined this change to ${file}. Do not retry it unless he asks.`;
}

/** Each user message on the branch, with everything the agent did after it: reply text, tool calls, and tool results. */
function sessionTurns(ctx: ExtensionContext): Turn[] {
	const turns: Turn[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const { message } = entry;
		if (message.role === "user") {
			const parts = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
			const user = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
			turns.push({ user: user.trim(), items: [] });
			continue;
		}
		const turn = turns.at(-1);
		if (!turn) continue;
		if (message.role === "toolResult") {
			const text = message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
			turn.items.push({ kind: "result", text, error: message.isError });
		}
		if (message.role !== "assistant") continue;
		for (const part of message.content) {
			if (part.type === "text" && part.text.trim()) turn.items.push({ kind: "text", text: part.text });
			if (part.type === "toolCall") turn.items.push({ kind: "call", text: `${part.name}: ${String(part.arguments.command ?? part.arguments.path ?? JSON.stringify(part.arguments))}` });
		}
	}
	return turns;
}

function readState(): State {
	const empty: State = { seen: {}, lessons: [], history: [], spool: [] };
	try {
		return { ...empty, ...(JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<State>) };
	} catch {
		return empty;
	}
}

/** Several sessions share the file. A write holds a lock, reads the state again, applies one change, and renames a temp file over the state, so no write loses another and a reader never sees a partial file. */
function updateState(change: (state: State) => void) {
	mkdirSync(path.dirname(STATE_FILE), { recursive: true });
	const lock = `${STATE_FILE}.lock`;
	const deadline = Date.now() + STATE_LOCK_TIMEOUT_MS;
	for (;;) {
		try {
			closeSync(openSync(lock, "wx"));
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			try {
				if (Date.now() - statSync(lock).mtimeMs > STATE_LOCK_STALE_MS) unlinkSync(lock);
			} catch {
				// The holder released the lock between the two calls.
			}
			if (Date.now() > deadline) throw new Error(`Memory state lock timeout: ${lock}`);
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 + Math.random() * 20);
		}
	}
	try {
		const state = readState();
		change(state);
		const keep = (record: Record<string, string>) => Object.fromEntries(Object.entries(record).slice(-SEEN_LIMIT));
		const trimmed = { ...state, seen: keep(state.seen), lessons: state.lessons.slice(-LESSON_LIMIT), history: state.history.slice(-HISTORY_LIMIT), spool: state.spool.slice(-SPOOL_LIMIT * 3) };
		const temp = `${STATE_FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
		writeFileSync(temp, JSON.stringify(trimmed));
		renameSync(temp, STATE_FILE);
	} finally {
		unlinkSync(lock);
	}
}

/** One line for each extracted lesson and each memory line that a diff adds or removes, with Arijit's decision, to tune the prompts and triggers against real junk rates. */
function logDecision(record: Record<string, unknown>) {
	mkdirSync(path.dirname(DECISIONS_FILE), { recursive: true });
	appendFileSync(DECISIONS_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`);
}

const today = () => new Date().toISOString().slice(0, 10);
const seenKey = (review: Review) => `${review.key}|${review.outcome ?? ""}`;

/** The watch-pr files that a tool call names, or that a watch.py result points to by its PR URL. */
function watchPrefixes(input: string, output: string): string[] {
	if (!input.includes("watch.py") && !input.includes(".outcomes.jsonl")) return [];
	const named = [...input.matchAll(/watch-pr\/([\w.-]+-\d+)\.(?:events|outcomes)\.jsonl/g)].map((match) => match[1]);
	const urls = [...output.matchAll(/github\.com\/([^/\s"]+)\/([^/\s"]+)\/pull\/(\d+)/g)].map((match) => `${match[1]}-${match[2]}-${match[3]}`);
	return [...new Set([...named, ...urls])];
}

/** The review comments of a PR with the agent's outcome for each. The files hold one JSON line per event. */
function watchReviews(prefix: string): Review[] {
	const events = readText(path.join(WATCH_DIR, `${prefix}.events.jsonl`));
	if (!events) return [];
	const pr = prefix.split("-").at(-1);
	return joinWatchFiles(events, readText(path.join(WATCH_DIR, `${prefix}.outcomes.jsonl`)) ?? "").map((review) => ({ ...review, pr }));
}

function bullets(text: string): string[] {
	return text.split("\n").flatMap((line) => (line.startsWith("- ") ? [line.slice(2).trim()] : []));
}

// A line that reflection wrote ends in its date, and the ticket if there was one. Reflection leaves other lines alone:
// in tests, Haiku reversed one of Arijit's lines while it shortened it, and deleted another to make room.
const REFLECTED = /\(\d{4}-\d{2}-\d{2}(, [A-Z]+-\d+)?\)$/;

/** Applies the ADD, UPDATE, and DELETE lines of a merge reply. Each new or changed line gets the date, and the ticket if there is one. */
function applyOperations(lines: MemoryLine[], reply: string, labels: string[], ticket: string | undefined): MemoryLine[] {
	const next = lines.map((line) => ({ ...line }));
	const deleted = new Set<number>();
	// Haiku writes semicolons despite the prompt. A period keeps one short sentence per idea.
	const stamp = (text: string) =>
		`${text.trim().replace(/;\s*(\w)/g, (_, first: string) => `. ${first.toUpperCase()}`)} (${new Date().toISOString().slice(0, 10)}${ticket ? `, ${ticket}` : ""})`;
	const editable = (n: number) => lines[n] !== undefined && REFLECTED.test(lines[n].text);
	for (const operation of reply.split("\n")) {
		const add = operation.match(/^ADD (\w+):\s*(.+)$/);
		if (add && labels.includes(add[1])) next.push({ label: add[1], text: stamp(add[2]) });
		const update = operation.match(/^UPDATE (\d+):\s*(.+)$/);
		if (update && editable(Number(update[1]) - 1)) next[Number(update[1]) - 1].text = stamp(update[2]);
		const remove = operation.match(/^DELETE (\d+)$/);
		if (remove && editable(Number(remove[1]) - 1)) deleted.add(Number(remove[1]) - 1);
	}
	return next.filter((_, index) => !deleted.has(index));
}

/** Replaces the `- ` lines of a memory file and keeps the heading above them. */
function renderMemory(before: string, lines: string[]): string {
	const heading = before.split("\n").filter((line) => !line.startsWith("- ")).join("\n").trim() || "# Memory";
	return `${heading}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`;
}

async function askHaiku(ctx: ExtensionContext, run: Run, systemPrompt: string, text: string): Promise<string | undefined> {
	const model = ctx.modelRegistry.find(REFLECT_PROVIDER, REFLECT_MODEL);
	if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) return undefined;
	const message = await ctx.modelRegistry
		.streamSimple(model, { systemPrompt, messages: [{ role: "user", content: [{ type: "text", text }], timestamp: Date.now() }] }, { reasoning: "low" })
		.result();
	if (message.stopReason === "error") throw new Error(message.errorMessage ?? "model error");
	run.calls++;
	run.input += message.usage.input + message.usage.cacheRead + message.usage.cacheWrite;
	run.output += message.usage.output;
	run.cost += message.usage.cost.total;
	return message.content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("")
		.trim();
}

export default function vault(pi: ExtensionAPI) {
	let block = "";
	let binding: Binding = {};
	const touched = new Set<string>();
	const warned = new Set<string>();
	let catalog: WorkstreamRules[] = [];
	const sentRules = new Set<string>();
	let memory = "";
	// The memory file content before each edit or write that pi has not finished, by tool call ID.
	const pendingMemory = new Map<string, { file: string; before: string | undefined }>();
	// User turns on the branch that reflection has read, whether a reflection runs now, and whether this session has reflected.
	let reflected = 0;
	let reflecting = false;
	let reflectedHere = false;
	let spoolTried = false;
	// Review comments from watch-pr that no reflection has read. The same comment is a new record when its outcome changes.
	let pendingReviews: Review[] = [];
	// The user turn count at the last checkpoint write or suggestion in this session.
	let checkpointed = 0;

	function current(): Binding {
		const match = block.match(/^Workstream: (\S+)(?: \((\S+)\))?$/m);
		if (match) return { ws: match[1], ticket: match[2] };
		const ticket = block.match(/^Ticket: (\S+)$/m);
		return ticket ? { ticket: ticket[1] } : {};
	}

	function checkpointPath(): string | undefined {
		return block.match(/^Checkpoint: (\S+)$/m)?.[1];
	}

	function checkpointPrompt(): string | undefined {
		const { ticket } = current();
		if (!ticket) return undefined;
		const file = checkpointPath() ?? `${WORKSTREAMS}/<workstream>/tasks/${ticket}.md`;
		return `Update the ${ticket} checkpoint at ${file}, so that a new agent can continue from here without this session. Follow "Write the checkpoint" in ${VAULT}/AGENTS.md. First run \`vault state ${ticket}\`, and read each PR's reviews and comments with \`gh pr view <number> --comments\`, bot reviews included, so that the checkpoint matches the live state. If a PR merged, Next holds only the work left after the merge. Edit in place: move finished steps out of Next, and remove what is no longer true. Add what this session learned that git and the code do not show, and name the source of each fact (a commit hash, test name, PR comment and its author, or what Arijit said): each trap or dead end with the test, error, or commit that showed it; what you checked and what is still not checked, such as a test file that never passed locally; and each correction or reversal, with who did what (the agent, Arijit, or a reviewer). When a later result contradicts an earlier claim, such as a test that passed and then failed, keep only the later one. Write each fact once, in one line that stands alone: what happened, the evidence, and the state now. Keep a warning apart from the result, such as a command that warned and still finished. For a cause that nobody found, say so, and name each cause that the evidence ruled out. Silence is not a ruling: write that Arijit or a reviewer agreed only when they said so. Record each decision with its reason, who asked for it, and its state now (in this PR, later, or rejected), and each idea that came up and was not built, with the reason. List each open question with the options that came up. An open question is one that Arijit or a reviewer must still answer. A question that Arijit or a reviewer asked and nobody answered stays open, even when it seems to conflict with a decision. An agent's suggestion that nobody took up is an idea not built, and it does not reopen a decision. Do not write worktrees, branch heads, or the merge, review, or CI status of a PR, because \`vault state\` prints them live. Then commit it with \`vault commit -m "${ticket}: checkpoint" ${file}\`.`;
	}

	async function refresh(ctx: ExtensionContext) {
		const args = ["context", "--cwd", ctx.cwd];
		if (binding.ws) args.push("--ws", binding.ws);
		if (binding.ticket) args.push("--ticket", binding.ticket);
		memory = memoryBlock(ctx.cwd);
		const [result, rules] = await Promise.all([pi.exec(CLI, args), pi.exec(CLI, ["rules", "--json"])]);
		block = result.code === 0 ? result.stdout.trim() : "";
		catalog = rules.code === 0 ? (JSON.parse(rules.stdout) as WorkstreamRules[]) : [];
		sentRules.clear();
		const bound = current().ws;
		if (bound) sentRules.add(bound);
		if (!ctx.hasUI) return;
		if (result.code !== 0) ctx.ui.notify(`vault context failed: ${result.stderr.trim()}`, "warning");
		const { ws, ticket } = current();
		ctx.ui.setStatus("vault", ws ? `${ws}${ticket ? ` ${ticket}` : ""}` : undefined);
	}

	/** Returns the rules not yet sent for each workstream whose `paths` appear in the text, and marks them sent. */
	function claimRules(text: string): string | undefined {
		const fresh = catalog.filter((entry) => !sentRules.has(entry.ws) && entry.paths.some((prefix) => text.includes(prefix)));
		if (fresh.length === 0) return undefined;
		for (const entry of fresh) sentRules.add(entry.ws);
		return fresh
			.map(
				(entry) =>
					`<workstream-rules ws="${entry.ws}">\nRules for code from the ${entry.ws} brief in the notes vault. They apply to ${entry.paths.join(", ")}. Follow them.\n\n${entry.rules}\n</workstream-rules>`,
			)
			.join("\n\n");
	}

	async function commit(ctx: ExtensionContext) {
		if (touched.size === 0) return;
		const paths = [...touched];
		touched.clear();
		const result = await pi.exec(CLI, ["commit", ...paths]);
		if (result.code !== 0 && ctx.hasUI) ctx.ui.notify(`vault commit failed: ${result.stderr.trim()}`, "warning");
	}

	function persistReviews() {
		pi.appendEntry(REVIEW_ENTRY, { reviews: pendingReviews });
	}

	/** Adds the review comments of a PR that no reflection has read. Returns whether any record is new. */
	function noteReviews(prefixes: string[]): boolean {
		const state = readState();
		const fresh = prefixes.flatMap(watchReviews).filter((review) => !state.seen[seenKey(review)]);
		if (fresh.length === 0) return false;
		const byKey = new Map(pendingReviews.map((review) => [review.key, review]));
		for (const review of fresh) byKey.set(review.key, review);
		pendingReviews = [...byKey.values()];
		persistReviews();
		return true;
	}

	/** Why a reflection is due now, or undefined. */
	function dueReason(turns: Turn[]): string | undefined {
		const turnScore = signals(turns)
			.slice(reflected)
			.reduce((sum, signal) => sum + signal.score, 0);
		const reviewScore = pendingReviews.reduce((sum, review) => sum + reviewPoints(review), 0);
		return shouldReflect({ turns: turns.length - reflected, score: turnScore + reviewScore, reviewScore, since: reflectedHere ? turns.length - reflected : 99 });
	}

	/** Keeps the digest of the pending turns and reviews for the next session that has a UI, and marks them read. */
	function spoolPending(turns: Turn[], why: string) {
		const window = turns.slice(reflected);
		const parts = [reviewUnit(pendingReviews), window.length ? digest(window, reflected) : ""].filter(Boolean);
		updateState((state) => {
			if (parts.length) state.spool.push({ id: `${today()}:${turns.length}:${why}`, text: parts.join("\n\n").slice(0, SPOOL_CLIP), at: today() });
			for (const review of pendingReviews) state.seen[seenKey(review)] = today();
		});
		reflected = turns.length;
		pendingReviews = [];
		pi.appendEntry(REFLECT_ENTRY, { turns: reflected });
		persistReviews();
	}

	/** Reads the pending reviews, the spooled digests, and the turns since the last reflection, then merges any lessons into the memory files once Arijit approves each diff. */
	async function reflect(ctx: ExtensionContext, why: string, manual = false) {
		reflecting = true;
		const run: Run = { calls: 0, input: 0, output: 0, cost: 0, lessons: [], operations: [] };
		const outcomes: string[] = [];
		try {
			const state = readState();
			const files = memoryFilesFor(ctx.cwd).map(([file, { label }]) => ({ file, label, before: readText(file) ?? "" }));
			const labels = files.map(({ label }) => label);
			let lines = files.flatMap(({ label, before }) => bullets(before).map((text) => ({ label, text })));
			const turns = sessionTurns(ctx);
			const scores = signals(turns);
			const history = [...state.history];
			const marked = withRepeats(pendingReviews, history);
			const spooled = state.spool.slice(0, SPOOL_LIMIT);
			const units = spooled.map((entry) => ({ kind: "spool", text: entry.text }));
			if (marked.length) units.push({ kind: "review", text: reviewUnit(marked) });
			// One extract and one merge for each chunk: in tests, one merge of a long session's lessons kept about half as many.
			for (let first = reflected; first < turns.length; first += REFLECT_EVERY) {
				const end = Math.min(first + REFLECT_EVERY, turns.length);
				const score = scores.slice(first, end).reduce((sum, signal) => sum + signal.score, 0);
				if (manual || score > 0) units.push({ kind: "chunk", text: digest(turns.slice(first, end), first) });
			}
			ctx.ui.notify(`Reflecting on ${turns.length - reflected} turns, ${marked.length} review comments, ${spooled.length} spooled digests (${why})…`, "info");
			const memoryCount = lines.length;
			const known = [...lines.map((line) => line.text), ...state.lessons];
			for (const unit of units) {
				const reply = await askHaiku(ctx, run, EXTRACT_PROMPT, unit.text);
				if (reply === undefined) return ctx.ui.notify(`Memory reflection needs ${REFLECT_PROVIDER}/${REFLECT_MODEL} with auth.`, "warning");
				const fresh = novel(parseLessons(reply), known);
				if (fresh.length === 0) continue;
				known.push(...fresh.map((lesson) => lesson.text));
				for (const lesson of fresh) if (!SENSITIVE.test(lesson.text)) logDecision({ kind: "lesson", why, unit: unit.kind, label: lesson.label, weight: lesson.weight, text: lesson.text.slice(0, 300) });
				const text = fresh.map((lesson) => `- [${lesson.label}] [w${lesson.weight}] ${lesson.text}`).join("\n");
				run.lessons.push(text);
				lines = await mergeLessons(ctx, run, lines, labels, text);
			}
			const seen = turns.length - reflected;
			reflected = turns.length;
			reflectedHere = true;
			pi.appendEntry(REFLECT_ENTRY, { turns: reflected });
			// Whatever Haiku read counts as processed, whether or not Arijit approves the lines, so that no fact is read twice.
			const freshLessons = known.slice(memoryCount + state.lessons.length);
			const readReviews = pendingReviews.map(({ repeats: _repeats, note: _note, ...review }) => ({ ...review, body: review.body.slice(0, 300) }));
			updateState((latest) => {
				for (const review of pendingReviews) latest.seen[seenKey(review)] = today();
				latest.history.push(...readReviews);
				latest.lessons.push(...freshLessons);
				latest.spool = latest.spool.filter((entry) => !spooled.some((read) => read.id === entry.id));
			});
			pendingReviews = [];
			persistReviews();
			for (const { file, label, before } of files) {
				const after = renderMemory(before, lines.filter((line) => line.label === label).map((line) => line.text));
				if (after === before) continue;
				writeFileSync(file, after);
				const reason = await reviewMemory(file, before, after, ctx);
				const decision = !reason ? "approved" : reason.startsWith("Arijit declined") ? "declined" : "blocked";
				const [oldLines, newLines] = [bullets(before), bullets(after)];
				for (const text of newLines.filter((line) => !oldLines.includes(line)))
					if (!SENSITIVE.test(text)) logDecision({ kind: "line", file: label, op: "add", decision, text });
				for (const text of oldLines.filter((line) => !newLines.includes(line)))
					if (!SENSITIVE.test(text)) logDecision({ kind: "line", file: label, op: "remove", decision, text });
				if (!reason) {
					outcomes.push(`${path.basename(file)}: approved`);
					continue;
				}
				writeFileSync(file, before);
				outcomes.push(`${path.basename(file)}: not applied`);
				ctx.ui.notify(reason, "warning");
			}
			const report = [
				`Reflected on ${seen} turns: ${run.calls} Haiku calls, ${run.input} in / ${run.output} out tokens, $${run.cost.toFixed(4)}.`,
				run.lessons.length ? `Extracted:\n${run.lessons.join("\n")}` : "Extracted: no lessons.",
				run.operations.length ? `Proposed:\n${run.operations.join("\n")}` : "Proposed: no memory changes.",
				...(outcomes.length ? [`Result: ${outcomes.join(", ")}`] : []),
			];
			ctx.ui.notify(report.join("\n"), "info");
		} catch (error) {
			ctx.ui.notify(`Memory reflection failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
		} finally {
			reflecting = false;
		}
	}

	async function mergeLessons(ctx: ExtensionContext, run: Run, lines: MemoryLine[], labels: string[], lessons: string): Promise<MemoryLine[]> {
		const numbered = lines
			.map((line, index) => `${index + 1}. [${line.label}]${REFLECTED.test(line.text) ? "" : " [fixed]"} ${line.text}`)
			.join("\n");
		const reply = await askHaiku(
			ctx,
			run,
			MERGE_PROMPT,
			`File labels in this session: ${labels.join(", ")}.\n\nCurrent files:\n${numbered}\n\nCandidate lessons:\n${lessons}`,
		);
		if (reply && reply !== "NO_CHANGE") run.operations.push(reply);
		return !reply || reply === "NO_CHANGE" ? lines : applyOperations(lines, reply, labels, current().ticket);
	}

	pi.on("session_start", async (_event, ctx) => {
		const branch = ctx.sessionManager.getBranch();
		const entry = branch.findLast((item) => item.type === "custom" && item.customType === BINDING_ENTRY);
		binding = entry?.type === "custom" ? (entry.data as Binding) : {};
		const mark = branch.findLast((item) => item.type === "custom" && item.customType === REFLECT_ENTRY);
		reflected = mark?.type === "custom" ? (mark.data as { turns: number }).turns : 0;
		const reviewMark = branch.findLast((item) => item.type === "custom" && item.customType === REVIEW_ENTRY);
		pendingReviews = reviewMark?.type === "custom" ? (reviewMark.data as { reviews: Review[] }).reviews : [];
		reflectedHere = false;
		spoolTried = false;
		checkpointed = sessionTurns(ctx).length;
		touched.clear();
		await refresh(ctx);
	});

	pi.on("session_compact", async (_event, ctx) => refresh(ctx));

	pi.on("before_agent_start", (event) => {
		warned.clear();
		if (block) event.systemPromptOptions.sections[SECTION] = block;
		if (memory) event.systemPromptOptions.sections[MEMORY_SECTION] = memory;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const target = event.input.path;
		if (typeof target !== "string") return;
		const file = resolve(ctx.cwd, target);
		const real = realPath(file);
		if (MEMORY_FILES.has(real)) {
			// A second change before the first one is reviewed would restore the wrong content on decline.
			if (reflecting || [...pendingMemory.values()].some((pending) => pending.file === real)) {
				return { block: true, reason: `Another change to ${real} is waiting for review. Make one change at a time.` };
			}
			pendingMemory.set(event.toolCallId, { file: real, before: readText(real) });
			return;
		}
		if (!file.startsWith(VAULT + path.sep)) {
			const rules = claimRules(file);
			if (!rules) return;
			return { block: true, reason: `Rules for code apply to ${target}. Follow them, then retry the ${event.toolName}.\n\n${rules}` };
		}
		const reason = guard(path.relative(VAULT, file), file, warned);
		return reason ? { block: true, reason } : undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		const pending = pendingMemory.get(event.toolCallId);
		if (pending) {
			pendingMemory.delete(event.toolCallId);
			if (event.isError) return;
			const after = readText(pending.file) ?? "";
			const reason = await reviewMemory(pending.file, pending.before ?? "", after, ctx);
			if (!reason) return;
			if (pending.before === undefined) rmSync(pending.file, { force: true });
			else writeFileSync(pending.file, pending.before);
			return { content: [{ type: "text", text: `${reason} The file is back to its old content.` }], isError: true };
		}
		if (event.toolName === "edit" || event.toolName === "write") {
			if (event.isError) return;
			const file = resolve(ctx.cwd, event.input.path as string);
			if (!file.startsWith(VAULT + path.sep)) return;
			touched.add(path.relative(VAULT, file));
			if (file.includes(`${path.sep}tasks${path.sep}`)) checkpointed = sessionTurns(ctx).length;
			return;
		}
		// A command or search can name a folder in its input or list files from it in its output.
		const input = typeof event.input.path === "string" ? resolve(ctx.cwd, event.input.path) : JSON.stringify(event.input);
		const output = event.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
		// A watch-pr batch or outcomes write logs review comments, and the end of the watch logs the final state. A session with a UI reflects at once.
		const prefixes = watchPrefixes(JSON.stringify(event.input), output);
		if (prefixes.length && noteReviews(prefixes) && ctx.hasUI && !reflecting) {
			const why = dueReason(sessionTurns(ctx));
			if (why) void reflect(ctx, why);
		}
		const rules = claimRules(`${ctx.cwd}\n${input}\n${output}`);
		if (!rules) return;
		return { content: [...event.content, { type: "text", text: rules }], structuredContent: event.structuredContent };
	});

	pi.on("agent_settled", async (_event, ctx) => {
		await commit(ctx);
		const turns = sessionTurns(ctx).length;
		if (ctx.hasUI && current().ticket && turns - checkpointed >= REFLECT_EVERY) {
			checkpointed = turns;
			ctx.ui.notify(`${turns} turns since the ${current().ticket} checkpoint changed. Run /checkpoint to save what this session learned.`, "info");
		}
		const all = sessionTurns(ctx);
		const why = dueReason(all);
		// A session without a UI, such as a subagent, cannot approve a diff, so it keeps its evidence for the next session that has one.
		if (!ctx.hasUI) return why ? spoolPending(all, why) : undefined;
		if (reflecting) return;
		if (why) return void reflect(ctx, why);
		if (!spoolTried && readState().spool.length > 0) {
			spoolTried = true;
			void reflect(ctx, "spooled evidence");
		}
	});

	pi.registerCommand("reflect", {
		description: "Find lessons in the turns since the last reflection and propose memory lines",
		handler: async (_args, ctx) => {
			if (reflecting) return ctx.ui.notify("A reflection is already running.", "info");
			if (sessionTurns(ctx).length === reflected && pendingReviews.length === 0 && readState().spool.length === 0) return ctx.ui.notify("Nothing new since the last reflection.", "info");
			await reflect(ctx, "manual", true);
		},
	});

	pi.registerCommand("checkpoint", {
		description: "Ask the agent to update the checkpoint of the session's ticket",
		handler: async (_args, ctx) => {
			const prompt = checkpointPrompt();
			if (!prompt) return ctx.ui.notify("No ticket is set. Run /ws <ticket> first.", "warning");
			pi.sendUserMessage(prompt, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
		},
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		await commit(ctx);
		const all = sessionTurns(ctx);
		const score = signals(all).slice(reflected).reduce((sum, signal) => sum + signal.score, 0) + pendingReviews.reduce((sum, review) => sum + reviewPoints(review), 0);
		if (score > 0 && !reflecting) spoolPending(all, "shutdown");
	});

	pi.registerCommand("ws", {
		description: "Show or set the notes-vault workstream: /ws [workstream] [ticket], /ws <ticket>, or /ws clear",
		getArgumentCompletions: (prefix) =>
			workstreams()
				.filter((name) => name.startsWith(prefix))
				.map((name) => ({ value: name, label: name })),
		handler: async (args, ctx) => {
			const [first, second] = args.trim().split(/\s+/).filter(Boolean);
			if (!first) {
				const { ws, ticket } = current();
				ctx.ui.notify(ws ? `Workstream: ${ws}${ticket ? ` (${ticket})` : ""}` : "No workstream is set.", "info");
				return;
			}
			if (first === "clear") binding = {};
			else if (existsSync(path.join(WORKSTREAMS, first))) binding = { ws: first, ticket: second?.toUpperCase() };
			else if (TICKET.test(first)) binding = { ticket: first.toUpperCase() };
			else {
				ctx.ui.notify(`No workstream ${first}. Workstreams: ${workstreams().join(", ")}`, "error");
				return;
			}
			pi.appendEntry(BINDING_ENTRY, binding);
			await refresh(ctx);
			const { ws, ticket } = current();
			ctx.ui.notify(ws ? `Workstream: ${ws}${ticket ? ` (${ticket})` : ""}` : "No workstream is set.", "info");
		},
	});
}
