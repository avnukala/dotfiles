import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Shows a pasted clipboard image as `[Image #N]` instead of its temp file path, and attaches the image on submit.
 *
 * Pi's Ctrl+V handler writes the clipboard image to `<tmpdir>/pi-clipboard-<uuid>.<ext>` and inserts that path at the
 * cursor. cmux's Cmd+V writes `<tmpdir>/clipboard-<date>-<time>-<hex>.<ext>` and sends the path as a bracketed paste.
 * The editor below swaps either path for a marker, so pi and cmux still own clipboard reads.
 */

const PASTED_IMAGE_NAME = /^(?:pi-clipboard-[0-9a-f-]{36}|clipboard-\d{4}-\d{2}-\d{2}-\d{6}-[0-9A-F]+)\.(png|jpg|webp|gif)$/;
const MIME_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const MARKER = /\[Image #(\d+)\]/g;

type Draft = { images: Map<string, ImageContent>; next: number };

function readPastedImage(text: string): ImageContent | undefined {
	if (path.dirname(text) !== tmpdir()) return undefined;
	const match = PASTED_IMAGE_NAME.exec(path.basename(text));
	if (!match) return undefined;
	return { type: "image", data: readFileSync(text).toString("base64"), mimeType: MIME_TYPES[match[1]] };
}

function* mergeMarkers(text: string, segments: Iterable<Intl.SegmentData>, draft: Draft): Iterable<Intl.SegmentData> {
	const spans = [...text.matchAll(MARKER)]
		.filter((match) => draft.images.has(match[0]))
		.map((match) => ({ start: match.index, end: match.index + match[0].length }));
	for (const segment of segments) {
		const span = spans.find(({ start, end }) => segment.index >= start && segment.index < end);
		if (!span) yield segment;
		else if (segment.index === span.start) yield { segment: text.slice(span.start, span.end), index: span.start, input: text };
	}
}

function nextImageNumber(ctx: ExtensionContext): number {
	let highest = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message.role !== "user") continue;
		const { content } = entry.message;
		const text = typeof content === "string" ? content : content.map((part) => (part.type === "text" ? part.text : "")).join("");
		for (const match of text.matchAll(MARKER)) highest = Math.max(highest, Number(match[1]));
	}
	return highest + 1;
}

export default function (pi: ExtensionAPI) {
	const draft: Draft = { images: new Map(), next: 1 };

	class ImagePasteEditor extends CustomEditor {
		constructor(...args: ConstructorParameters<typeof CustomEditor>) {
			super(...args);
			// Editor.segment is private; merging markers here makes cursor moves and Backspace treat them as one unit.
			const segment = this["segment"].bind(this);
			this["segment"] = (text: string, mode?: "word" | "grapheme") => mergeMarkers(text, segment(text, mode), draft);
			const handlePaste = this["handlePaste"].bind(this);
			this["handlePaste"] = (text: string) => this.insertImageMarker(text.trim()) || handlePaste(text);
		}

		override insertTextAtCursor(text: string): void {
			if (!this.insertImageMarker(text)) super.insertTextAtCursor(text);
		}

		private insertImageMarker(text: string): boolean {
			const image = readPastedImage(text);
			if (!image) return false;
			const marker = `[Image #${draft.next++}]`;
			draft.images.set(marker, image);
			super.insertTextAtCursor(marker);
			return true;
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		draft.images.clear();
		draft.next = nextImageNumber(ctx);
		if (ctx.mode === "tui") ctx.ui.setEditorComponent((tui, theme, keybindings) => new ImagePasteEditor(tui, theme, keybindings));
	});

	pi.on("input", async (event) => {
		const images = [...event.text.matchAll(MARKER)].flatMap((match) => draft.images.get(match[0]) ?? []);
		if (images.length === 0) return { action: "continue" };
		return { action: "transform", text: event.text, images: [...(event.images ?? []), ...images] };
	});
}
