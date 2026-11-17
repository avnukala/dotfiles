/**
 * Pure helpers for memory reflection in vault.ts: a cheap signal score for session turns, a compact digest of whole
 * turns for the extract call, review records from watch-pr files and tool output, and a similarity test for lessons.
 * No pi imports and no file access, so the eval harness runs them with node.
 */

export type Item = { kind: "text" | "call" | "result"; text: string; error?: boolean };
export type Turn = { user: string; items: Item[] };
export type Review = { key: string; author: string; path?: string; body: string; outcome?: string; note?: string; pr?: string; repeats?: { pr: string; body: string }[] };
export type Lesson = { label: string; weight: number; text: string };
export type Signal = { score: number; reasons: string[] };
export type Candidate = Lesson & { count: number; last: string };
export type Pending = { turns: number; score: number; reviewScore: number; since: number };

const NOISE_AUTHORS = /^(cd-deploy-tracking|trunk-io|linear|dependabot|codecov|github-actions)/;
const NOISE_BODY = /^(<!--|Linear link|## Merge|Deploy)|^(thanks|thank you|lgtm|looks good|approved)\b[^\n]{0,40}$/i;

const REMEMBER = /\b(remember (this|that)|from now on|i told you|do you remember|never again)\b/i;
const ANGRY = /\?\?\?|\b(wtf|bullshit|what the (hell|fuck|helly)|how the (hell|helly|fuck)|stop (running|doing|adding)|ridiculous)\b/i;
const PUSHBACK =
	/\b(why (did|do|should) (we|you|i) (need|have|add|make|create)|without (adding|any)|do we (really )?need|(can|could|should) we (drop|remove|cut|merge|reuse)|too much|remove (this|that|these|the)|shorter|drop (it|this|that)|revert|undo|use the existing|existing (helper|pattern|one)|is there (a|an) (existing|newer|pattern|primitive)|shouldn'?t we (call|name|use)|rename|move (it|this|them) (to|under|into)|don'?t|do not|never|always|keep it (minimal|short|simple)|no need|not needed|instead of)\b/i;
const AGREE = /^\s*(yes|yep|ok|okay|sure|continue|go ahead|go on|commit|push|thanks|thank you|do it|lgtm|sounds good|proceed)\b/i;
const REVERT_CALL = /\bgit (revert|reset --hard|checkout --|restore)\b/;

const USER_CLIP = 1500;
const REPLY_HEAD = 300;
const REPLY_TAIL = 700;
const ERROR_CLIP = 240;
const REVIEW_LIMIT = 14;

// A reflection costs about two Haiku calls, so each rule needs evidence that a lesson exists.
export const TRIGGER = { now: 4, chunk: 12, chunkScore: 2, stale: 30, staleScore: 1, review: 2, cooldown: 3 };

const STOP = new Set("this that with from have should could would there about think maybe these those what when which where does into than then also just only they them their been were will your".split(" "));

function tokens(text: string): Set<string> {
	const words = text.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/g) ?? [];
	return new Set(words.map((word) => word.replace(/(ing|ed|es|s)$/, "")).filter((word) => word.length >= 3 && !STOP.has(word)));
}

/** Share of the shorter text's words that the other text has. */
export function similarity(a: string, b: string): number {
	const left = tokens(a);
	const right = tokens(b);
	let shared = 0;
	for (const word of left) if (right.has(word)) shared++;
	return shared / Math.max(1, Math.min(left.size, right.size));
}

function clip(text: string, limit: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > limit ? `${flat.slice(0, limit)} …` : flat;
}

export function isHuman(author: string): boolean {
	return !author.endsWith("[bot]") && !NOISE_AUTHORS.test(author);
}

/** 3 for an explicit save request, 2 for anger, 1 for push-back, 0 for agreement or none. */
export function pushback(user: string): number {
	const text = user.trim();
	if (!text || (AGREE.test(text) && text.length < 60)) return 0;
	if (REMEMBER.test(text)) return 3;
	if (ANGRY.test(text)) return 2;
	return PUSHBACK.test(text) ? 1 : 0;
}

/** Points of one review record. A comment with no outcome yet scores 0, so a batch does not trigger before the agent answers it. */
export function reviewPoints(review: Review): number {
	if (!review.outcome) return 0;
	const base = isHuman(review.author) ? (review.outcome === "fixed" ? 3 : 2) : review.outcome === "fixed" ? 1 : 0;
	return base + (review.repeats?.length ? 2 : 0);
}

/** Score of each turn: push-back, a repeat of an earlier push-back, a revert, and review feedback keyed by turn index. */
export function signals(turns: Turn[], reviews: Map<number, Review[]> = new Map()): Signal[] {
	const earlier: string[] = [];
	return turns.map((turn, index) => {
		const reasons: string[] = [];
		let score = pushback(turn.user);
		if (score) reasons.push(`pushback:${score}`);
		if (score && earlier.some((text) => similarity(text, turn.user) >= 0.35)) {
			score += 2;
			reasons.push("repeat");
		}
		if (score) earlier.push(turn.user);
		if (turn.items.some((item) => item.kind === "call" && REVERT_CALL.test(item.text))) {
			score += 2;
			reasons.push("revert");
		}
		for (const review of reviews.get(index) ?? []) {
			const add = reviewPoints(review);
			if (add) reasons.push(`review:${isHuman(review.author) ? "human" : "bot"}:${review.outcome ?? "open"}`);
			score += add;
		}
		return { score, reasons };
	});
}

/**
 * Marks each record of a batch with up to 2 similar records from earlier batches, on this PR or others. A finding that other PRs saw too is a repeat,
 * and a repeat is the strongest sign of a lesson.
 */
export function withRepeats(batch: Review[], history: Review[]): Review[] {
	return batch.map((review) => {
		const repeats = history
			.filter((old) => old.key !== review.key && isHuman(old.author) === isHuman(review.author))
			.map((old) => ({ old, score: similarity(plain(old), plain(review)), shared: [...tokens(plain(old))].filter((word) => tokens(plain(review)).has(word)).length }))
			.filter(({ score, shared }) => score >= 0.5 && shared >= 3 && tokens(plain(review)).size >= 4)
			.sort((a, b) => b.score - a.score)
			.slice(0, 2)
			.map(({ old }) => ({ pr: old.pr === review.pr ? "this PR" : `PR ${old.pr ?? "?"}`, body: plain(old) }));
		return repeats.length ? { ...review, repeats } : review;
	});
}

/** Drops deploy and link bots, empty bodies, and a repeated body. */
export function usefulReviews(reviews: Review[]): Review[] {
	const seen = new Set<string>();
	return reviews.filter((review) => {
		const key = `${review.author}|${review.body.slice(0, 80)}`;
		if (NOISE_AUTHORS.test(review.author) || NOISE_BODY.test(review.body.trim()) || !review.body.trim() || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

// A Bugbot comment is a markdown title, a severity, and prose. The title and the first sentences carry the finding.
function bugbotBody(body: string): string {
	const title = body.match(/^#+\s*(.+)$/m)?.[1] ?? "";
	const text = body.replace(/<!--[\s\S]*?-->/g, " ").replace(/^#+.*$/m, "").replace(/\*\*[A-Za-z ]+Severity\*\*/, "");
	return clip(`${title}: ${text}`, 260);
}

/** The text that identifies a finding: a person's comment, or a Bugbot title and first sentences. */
function plain(review: Review): string {
	return isHuman(review.author) ? review.body : bugbotBody(review.body);
}

/** One line for a review record, with what the agent did about it. */
export function reviewLine(review: Review): string {
	const human = isHuman(review.author);
	const body = human ? clip(review.body, 420) : bugbotBody(review.body);
	const where = review.path ? ` ${review.path.split("/").pop()}` : "";
	const outcome = review.outcome ? ` -> ${review.outcome}${review.note ? ` (${clip(review.note, 140)})` : ""}` : " -> open";
	const repeats = (review.repeats ?? []).map((repeat) => ` | REPEAT on ${repeat.pr}: ${clip(repeat.body, 100)}`).join("");
	return `REVIEW ${human ? "human" : "bot"} ${review.author}${where}: ${body}${outcome}${repeats}`;
}

function jsonLines(text: string): Record<string, unknown>[] {
	return text.split("\n").flatMap((line) => {
		try {
			return line.trim() ? [JSON.parse(line) as Record<string, unknown>] : [];
		} catch {
			return [];
		}
	});
}

/** Joins the events and outcomes files of watch-pr on `key`. */
export function joinWatchFiles(events: string, outcomes: string): Review[] {
	const done = new Map(jsonLines(outcomes).map((row) => [String(row.key), row]));
	return usefulReviews(
		jsonLines(events).flatMap((row) => {
			if (!["thread", "review", "comment"].includes(String(row.type)) || typeof row.body !== "string") return [];
			const outcome = done.get(String(row.key));
			return [
				{
					key: String(row.key),
					author: String(row.author ?? "unknown"),
					path: typeof row.path === "string" ? row.path : undefined,
					body: row.body,
					outcome: typeof outcome?.outcome === "string" ? outcome.outcome : undefined,
					note: typeof outcome?.note === "string" ? outcome.note : undefined,
				},
			];
		}),
	);
}

const REVIEW_MARKER = /"(reviewThreads|reviews|isResolved)"|"type": ?"(thread|review)"|CHANGES_REQUESTED|cursor\[bot\]/;

/** Review comments in a tool result, such as `gh pr view --json comments` output that the watch-pr files do not cover. */
export function reviewsFromOutput(text: string): Review[] {
	if (!REVIEW_MARKER.test(text)) return [];
	const found: Review[] = [];
	const visit = (node: unknown) => {
		if (Array.isArray(node)) return node.forEach(visit);
		if (!node || typeof node !== "object") return;
		const row = node as Record<string, unknown>;
		const owner = row.author ?? row.user;
		const author = typeof owner === "string" ? owner : (owner as { login?: string } | undefined)?.login;
		if (typeof row.body === "string" && author) {
			found.push({ key: String(row.url ?? row.id ?? row.databaseId ?? row.body.slice(0, 40)), author, path: typeof row.path === "string" ? row.path : undefined, body: row.body });
		}
		Object.values(row).forEach(visit);
	};
	for (const candidate of [text, ...text.split("\n")]) {
		try {
			visit(JSON.parse(candidate));
		} catch {
			continue;
		}
		if (found.length) break;
	}
	return usefulReviews(found);
}

/** Tool names with counts, and the base names of up to 4 files that the agent edited or wrote. */
function toolSummary(calls: Item[]): string {
	const counts = new Map<string, number>();
	const files = new Set<string>();
	for (const call of calls) {
		const [name, ...rest] = call.text.split(": ");
		counts.set(name, (counts.get(name) ?? 0) + 1);
		const target = rest.join(": ").split(/\s/)[0];
		if ((name === "edit" || name === "write") && target) files.add(target.split("/").pop() ?? target);
	}
	const names = [...counts].map(([name, count]) => `${name}x${count}`).join(" ");
	return files.size ? `${names}, files ${[...files].slice(0, 4).join(" ")}` : names;
}

/**
 * A compact view of whole turns for the extract call. Arijit's words stay almost whole. An agent reply keeps its first and
 * last words. A tool call is dropped unless it reverts work. A tool result is dropped unless it failed or holds review comments.
 */
export function digest(turns: Turn[], first: number, reviews: Map<number, Review[]> = new Map()): string {
	return turns
		.map((turn, index) => {
			const n = first + index;
			const lines = [`[${n}] ARIJIT: ${clip(turn.user, USER_CLIP)}`];
			const calls = turn.items.filter((item) => item.kind === "call");
			for (const call of calls) if (REVERT_CALL.test(call.text)) lines.push(`[${n}] AGENT RAN: ${clip(call.text, 160)}`);
			for (const item of turn.items) if (item.kind === "result" && item.error) lines.push(`[${n}] ERROR: ${clip(item.text, ERROR_CLIP)}`);
			const found = [...(reviews.get(index) ?? [])];
			for (const item of turn.items) if (item.kind === "result" && !item.error) found.push(...reviewsFromOutput(item.text));
			const unique = usefulReviews(found).sort((a, b) => Number(isHuman(b.author)) - Number(isHuman(a.author)));
			for (const review of unique.slice(0, REVIEW_LIMIT)) lines.push(`[${n}] ${reviewLine(review)}`);
			if (calls.length) lines.push(`[${n}] AGENT TOOLS: ${toolSummary(calls)}`);
			const replies = turn.items.flatMap((item) => (item.kind === "text" && item.text.trim() ? [item.text.trim()] : []));
			const head = replies[0] ?? "";
			const tail = replies.at(-1) ?? "";
			const shown = replies.length > 1 ? `${clip(head, REPLY_HEAD)} … ${clip(tail, REPLY_TAIL)}` : clip(tail, REPLY_TAIL);
			lines.push(`[${n}] AGENT (${calls.length} tool calls): ${shown}`);
			return lines.join("\n");
		})
		.join("\n\n");
}

/** The review comments of one extract call, most useful first: people before bots. */
export function reviewUnit(reviews: Review[]): string {
	const ranked = usefulReviews(reviews).sort((a, b) => Number(isHuman(b.author)) - Number(isHuman(a.author)));
	return ranked.length ? `Reviews on Arijit's PRs, with what the agent did about each:\n${ranked.slice(0, REVIEW_LIMIT).map(reviewLine).join("\n")}` : "";
}

/** Why to reflect now, or undefined. `since` counts turns since the last reflection finished. */
export function shouldReflect(pending: Pending): string | undefined {
	if (pending.reviewScore >= TRIGGER.review) return "review feedback";
	if (pending.turns === 0 || pending.since < TRIGGER.cooldown) return undefined;
	if (pending.score >= TRIGGER.now) return "strong signal";
	if (pending.turns >= TRIGGER.chunk && pending.score >= TRIGGER.chunkScore) return `${TRIGGER.chunk} turns with push-back`;
	if (pending.turns >= TRIGGER.stale && pending.score >= TRIGGER.staleScore) return `${TRIGGER.stale} turns`;
	return undefined;
}

/** Parses `- [global|valon] [w3] rule` lines. Haiku sometimes drops the dash or writes `[w3] global: rule`, so both parse. No weight means 2. */
export function parseLessons(text: string): Lesson[] {
	return text.split("\n").flatMap((raw) => {
		const line = raw.trim().replace(/^-\s*/, "");
		const match = line.match(/^\[(global|valon)\]\s*(?:\[?w([123])\]?:?\s+)?(.+)$/i) ?? line.match(/^\[?w([123])\]?\s+(global|valon):?\s*(.+)$/i);
		if (!match) return [];
		const swapped = /^[123]$/.test(match[1]);
		const label = (swapped ? match[2] : match[1]).toLowerCase();
		const weight = Number(swapped ? match[1] : match[2] ?? 2);
		return [{ label, weight, text: match[3].trim() }];
	});
}

/**
 * Adds lessons to the candidate store and returns the ones to merge now. Weight 2 and 3 lessons go on. A weight 1 lesson
 * waits for a similar lesson from a later reflection, then both go on as one. A candidate that waited 45 days is dropped.
 */
export function promote(store: Candidate[], lessons: Lesson[], today: string): { store: Candidate[]; promoted: Lesson[] } {
	const age = (day: string) => (Date.parse(today) - Date.parse(day)) / 86_400_000;
	const next = store.filter((candidate) => age(candidate.last) <= 45);
	const promoted: Lesson[] = [];
	for (const lesson of lessons) {
		const match = next.find((candidate) => candidate.label === lesson.label && similarity(candidate.text, lesson.text) >= 0.5);
		if (match) {
			next.splice(next.indexOf(match), 1);
			promoted.push({ ...lesson, weight: Math.max(lesson.weight, 2) });
		} else if (lesson.weight >= 2) promoted.push(lesson);
		else next.push({ ...lesson, count: 1, last: today });
	}
	return { store: next, promoted };
}

/** Drops a lesson that repeats a saved memory line. */
export function novel(lessons: Lesson[], memory: string[]): Lesson[] {
	return lessons.filter((lesson) => !memory.some((line) => similarity(line, lesson.text) >= 0.6));
}
