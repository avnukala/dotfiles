import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { CustomEditor, type EditorFactory, type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";

/**
 * Keeps prompt history across sessions, like shell history, and saves a draft to history when the editor is cleared.
 *
 * Pi already recalls prompts from the current session with Up. This extension wraps whichever editor is active, so it
 * works next to other extensions that replace the editor, such as image-paste.
 */

const HISTORY_FILE = path.join(getAgentDir(), "prompt-history.jsonl");
const HISTORY_LIMIT = 100;
const wrapped = new WeakSet<EditorFactory>();

function loadHistory(): string[] {
	if (!existsSync(HISTORY_FILE)) return [];
	const lines = readFileSync(HISTORY_FILE, "utf8").split("\n").filter(Boolean);
	const recent = lines.slice(-HISTORY_LIMIT);
	if (lines.length > HISTORY_LIMIT * 10) writeFileSync(HISTORY_FILE, `${recent.join("\n")}\n`);
	return recent.map((line) => JSON.parse(line) as string);
}

function withHistory(editor: EditorComponent): EditorComponent {
	// Editor.history and Editor.historyIndex are private; pi-tui has no public API to dedupe or to read browse state.
	const fields = editor as unknown as { history: string[]; historyIndex: number };
	const addToHistory = editor.addToHistory?.bind(editor);
	if (!addToHistory) return editor;

	editor.addToHistory = (text) => {
		fields.history = fields.history.filter((entry) => entry !== text.trim());
		addToHistory(text);
	};
	for (const text of loadHistory()) editor.addToHistory(text);

	const handleInput = editor.handleInput.bind(editor);
	editor.handleInput = (data) => {
		const before = editor.getExpandedText?.() ?? editor.getText();
		const browsing = fields.historyIndex > -1;
		handleInput(data);
		if (browsing || !before.trim() || editor.getText().trim()) return;
		editor.addToHistory?.(before);
		appendFileSync(HISTORY_FILE, `${JSON.stringify(before.trim())}\n`);
	};
	return editor;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		// Runs after every session_start handler, so it wraps an editor that another extension set in its own handler.
		setTimeout(() => {
			const base = ctx.ui.getEditorComponent();
			if (base && wrapped.has(base)) return;
			const factory: EditorFactory = (tui, theme, keybindings) =>
				withHistory(base?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings));
			wrapped.add(factory);
			ctx.ui.setEditorComponent(factory);
		}, 0);
	});
}
