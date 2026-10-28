// Background terminals as one `terminal` tool. It is a separate tool, not a `bash` override,
// so pi-cursor-sdk exposes it to Cursor models as `pi__terminal`; Cursor hides overlapping built-ins.

import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, fstatSync, mkdtempSync, openSync, readSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import { type ExtensionAPI, type ExtensionUIContext, getShellConfig } from "@earendil-works/pi-coding-agent";

const MAX_OUTPUT_BYTES = 16 * 1024;
const NOTICE_OUTPUT_BYTES = 2 * 1024;
const MAX_WAIT_SECONDS = 600;
const STOP_GRACE_SECONDS = 3;
const SCAN_INTERVAL_MS = 500;
const MAX_MATCH_LINES = 20;
const DEFAULT_WAIT_SECONDS = { start: 2, write: 1, read: 0 };
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\r(?!\n)/g;

interface Terminal {
	id: string;
	command: string;
	log: string;
	child: ChildProcess;
	startedAt: number;
	exited: Promise<void>;
	exit?: string;
	exitedAt?: number;
	/** Bytes of the log that a result or notice already showed. */
	cursor: number;
	/** The agent saw the exit, so no completion notice is needed. */
	reported: boolean;
	waiters: number;
	/** Bytes of the log that the notifyOn scan already checked. */
	scanned: number;
	notifyOn?: RegExp;
	scanTimer?: ReturnType<typeof setInterval>;
}

function summary(terminal: Terminal): string {
	const seconds = Math.round(((terminal.exitedAt ?? Date.now()) - terminal.startedAt) / 1000);
	return `${terminal.id} ${terminal.exit ?? "running"} after ${seconds}s: ${terminal.command}`;
}

function readNew(terminal: Terminal, maxBytes: number): string {
	const fd = openSync(terminal.log, "r");
	try {
		const size = fstatSync(fd).size;
		const start = Math.max(terminal.cursor, size - maxBytes);
		const buffer = Buffer.alloc(size - start);
		readSync(fd, buffer, 0, buffer.length, start);
		const omitted = start - terminal.cursor;
		terminal.cursor = size;
		const text = buffer.toString("utf8").replace(ANSI, "");
		return omitted > 0 ? `[${omitted} earlier bytes omitted; read the log for all output]\n${text}` : text;
	} finally {
		closeSync(fd);
	}
}

function signalGroup(terminal: Terminal, signal: NodeJS.Signals) {
	try {
		process.kill(-terminal.child.pid!, signal);
	} catch {
		// The group already exited.
	}
}

async function waitForExit(terminal: Terminal, seconds: number, signal?: AbortSignal) {
	if (terminal.exit || seconds <= 0) return;
	const timeout = AbortSignal.timeout(Math.min(seconds, MAX_WAIT_SECONDS) * 1000);
	const done = signal ? AbortSignal.any([timeout, signal]) : timeout;
	terminal.waiters++;
	try {
		await Promise.race([terminal.exited, new Promise((resolve) => done.addEventListener("abort", resolve, { once: true }))]);
	} finally {
		terminal.waiters--;
	}
}

function report(terminal: Terminal): string {
	if (terminal.exit) terminal.reported = true;
	const output = readNew(terminal, MAX_OUTPUT_BYTES);
	return `${summary(terminal)}\nlog: ${terminal.log}\n${output ? `--- new output ---\n${output}` : "(no new output)"}`;
}

export default function (pi: ExtensionAPI) {
	const terminals = new Map<string, Terminal>();
	let logDir: string | undefined;
	let ui: ExtensionUIContext | undefined;

	function updateStatus() {
		const running = [...terminals.values()].filter((terminal) => !terminal.exit).length;
		ui?.setStatus("terminal", running ? `${running} bg terminal${running === 1 ? "" : "s"}` : undefined);
	}

	/** Sends one follow-up with the new log lines that match notifyOn. Matches in one scan share a message. */
	function scan(terminal: Terminal) {
		if (!terminal.notifyOn) return;
		const size = statSync(terminal.log).size;
		if (size <= terminal.scanned) return;
		const fd = openSync(terminal.log, "r");
		let text: string;
		try {
			const buffer = Buffer.alloc(size - terminal.scanned);
			readSync(fd, buffer, 0, buffer.length, terminal.scanned);
			text = buffer.toString("utf8");
		} finally {
			closeSync(fd);
		}
		// Hold back a partial last line until it ends, unless the process exited.
		const end = terminal.exit ? text.length : text.lastIndexOf("\n") + 1;
		terminal.scanned += Buffer.byteLength(text.slice(0, end));
		const lines = text.slice(0, end).replace(ANSI, "").split("\n").filter((line) => terminal.notifyOn!.test(line));
		if (!lines.length) return;
		const shown = lines.slice(0, MAX_MATCH_LINES);
		const more = lines.length - shown.length;
		pi.sendMessage(
			{
				customType: "terminal",
				content: `Background terminal ${terminal.id} output matched /${terminal.notifyOn.source}/ (${summary(terminal)})\nlog: ${terminal.log}\n${shown.join("\n")}${more ? `\n[${more} more matching lines in the log]` : ""}`,
				display: true,
				details: { id: terminal.id, match: true },
			},
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	}

	function finish(terminal: Terminal, exit: string, resolveExited: () => void) {
		if (terminal.exit) return;
		clearInterval(terminal.scanTimer);
		terminal.exit = exit;
		terminal.exitedAt = Date.now();
		scan(terminal);
		terminal.exit = exit;
		terminal.exitedAt = Date.now();
		resolveExited();
		updateStatus();
		if (terminal.waiters > 0 || terminal.reported) return;
		const output = readNew(terminal, NOTICE_OUTPUT_BYTES);
		pi.sendMessage(
			{
				customType: "terminal",
				content: `Background terminal ${summary(terminal)}\nlog: ${terminal.log}\n${output ? `--- last output ---\n${output}` : "(no new output)"}`,
				display: true,
				details: { id: terminal.id, exit },
			},
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	}

	function start(command: string, cwd: string, interactive: boolean, notifyOn?: RegExp): Terminal {
		if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Not a directory: ${cwd}`);
		logDir ??= mkdtempSync(path.join(tmpdir(), "pi-terminal-"));
		const id = `t${terminals.size + 1}`;
		const log = path.join(logDir, `${id}.log`);
		const fd = openSync(log, "a");
		const { shell, args } = getShellConfig();
		// Python buffers stdout when it is not a TTY, which hides server banners and REPL output.
		const env = { ...process.env, PYTHONUNBUFFERED: "1" };
		const child = spawn(shell, [...args, command], { cwd, env, detached: true, stdio: [interactive ? "pipe" : "ignore", fd, fd] });
		closeSync(fd);
		// A write after the process exits raises EPIPE on stdin, which would crash pi if unhandled.
		child.stdin?.on("error", () => {});

		let resolveExited = () => {};
		const exited = new Promise<void>((resolve) => (resolveExited = resolve));
		const terminal: Terminal = { id, command, log, child, startedAt: Date.now(), exited, cursor: 0, reported: false, waiters: 0, scanned: 0, notifyOn };
		child.on("exit", (code, signal) => finish(terminal, signal ? `killed by ${signal}` : `exited with code ${code}`, resolveExited));
		child.on("error", (error) => finish(terminal, `failed: ${error.message}`, resolveExited));
		terminals.set(id, terminal);
		if (notifyOn) terminal.scanTimer = setInterval(() => scan(terminal), SCAN_INTERVAL_MS);
		updateStatus();
		return terminal;
	}

	async function stop(terminal: Terminal) {
		terminal.reported = true;
		if (terminal.exit) return;
		signalGroup(terminal, "SIGTERM");
		await waitForExit(terminal, STOP_GRACE_SECONDS);
		if (!terminal.exit) signalGroup(terminal, "SIGKILL");
		await terminal.exited;
	}

	function find(id: string | undefined): Terminal {
		const terminal = id ? terminals.get(id) : undefined;
		if (!terminal) throw new Error(`Unknown terminal ${id}. Known: ${[...terminals.keys()].join(", ") || "none"}`);
		return terminal;
	}

	pi.on("session_start", (_event, ctx) => {
		ui = ctx.ui;
	});

	pi.on("session_shutdown", () => {
		for (const terminal of terminals.values()) {
			terminal.reported = true;
			clearInterval(terminal.scanTimer);
			if (!terminal.exit) signalGroup(terminal, "SIGKILL");
		}
		ui?.setStatus("terminal", undefined);
	});

	pi.registerCommand("terminals", {
		description: "List background terminals; pick a running one to stop it",
		handler: async (_args, ctx) => {
			const all = [...terminals.values()];
			if (!all.length) return ctx.ui.notify("No terminals.", "info");
			const options = all.map(summary);
			const terminal = all[options.indexOf((await ctx.ui.select("Background terminals", options)) ?? "")];
			if (!terminal) return;
			if (terminal.exit) return ctx.ui.notify(`${summary(terminal)}\nlog: ${terminal.log}`, "info");
			if (!(await ctx.ui.confirm(`Stop ${terminal.id}?`, terminal.command))) return;
			await stop(terminal);
			ctx.ui.notify(`${summary(terminal)}\nlog: ${terminal.log}`, "info");
		},
	});

	pi.registerTool({
		name: "terminal",
		label: "Terminal",
		description:
			"Run shell commands in background terminals, such as dev servers, watchers, and long builds or tests. " +
			"Actions: start, read (new output), write (stdin of an interactive terminal, end with \\n to submit), stop, list. " +
			"`wait` blocks up to that many seconds for exit, then returns new output. Pi messages you when a terminal you did not wait for exits or a line matches notifyOn. Pi kills all terminals at session end.",
		promptSnippet: "Run long or never-ending shell commands in background terminals",
		promptGuidelines: [
			"Use terminal start, not a foreground shell command with &, nohup, or a long timeout, for commands that run longer than about a minute or never exit.",
			"After terminal start, do other work or end your turn. Pi sends a message when the command exits, so do not poll with sleep or repeated reads.",
			"Use terminal read with wait only when your next step needs that result now.",
			"Stop terminals that you no longer need.",
		],
		parameters: Type.Object({
			action: StringEnum(["start", "read", "write", "stop", "list"] as const),
			command: Type.Optional(Type.String({ description: "start: shell command to run" })),
			cwd: Type.Optional(Type.String({ description: "start: working directory, relative to the session cwd" })),
			interactive: Type.Optional(Type.Boolean({ description: "start: keep stdin open for write. Default false: stdin gets EOF." })),
			notifyOn: Type.Optional(Type.String({ description: "start: regex, such as \"ready|error\". Pi messages you when an output line matches. Use it instead of polling." })),
			id: Type.Optional(Type.String({ description: "read, write, stop: terminal id, such as t1" })),
			input: Type.Optional(Type.String({ description: "write: text to send to stdin" })),
			wait: Type.Optional(
				Type.Number({ description: `start, read, write: seconds to wait for exit before returning (default start 2, write 1, read 0; max ${MAX_WAIT_SECONDS})` }),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			ui = ctx.ui;
			let text: string;
			switch (params.action) {
				case "start": {
					if (!params.command?.trim()) throw new Error("start needs a command");
					const notifyOn = params.notifyOn ? new RegExp(params.notifyOn) : undefined;
					const terminal = start(params.command, path.resolve(ctx.cwd, params.cwd ?? "."), params.interactive ?? false, notifyOn);
					await waitForExit(terminal, params.wait ?? DEFAULT_WAIT_SECONDS.start, signal);
					text = report(terminal);
					break;
				}
				case "read": {
					const terminal = find(params.id);
					await waitForExit(terminal, params.wait ?? DEFAULT_WAIT_SECONDS.read, signal);
					text = report(terminal);
					break;
				}
				case "write": {
					const terminal = find(params.id);
					if (params.input === undefined) throw new Error("write needs input");
					if (terminal.exit) throw new Error(`${terminal.id} already ${terminal.exit}`);
					if (!terminal.child.stdin) throw new Error(`${terminal.id} was not started with interactive: true`);
					terminal.child.stdin.write(params.input);
					await waitForExit(terminal, params.wait ?? DEFAULT_WAIT_SECONDS.write, signal);
					text = report(terminal);
					break;
				}
				case "stop": {
					const terminal = find(params.id);
					await stop(terminal);
					text = report(terminal);
					break;
				}
				case "list":
					text = [...terminals.values()].map(summary).join("\n") || "No terminals.";
					break;
			}
			return { content: [{ type: "text", text }], details: undefined };
		},
	});
}
