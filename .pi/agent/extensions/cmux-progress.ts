// Sends pi's current activity to the cmux sidebar as the workspace progress label,
// and gives the model a notify tool for mid-run updates.
// cmux-session.ts owns status, lifecycle, and turn-end notifications.

import { execFile, spawn } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const THINKING = "Thinking…";
const MAX_LABEL = 80;

function clip(text: string, max: number): string {
  const line = text.split("\n", 1)[0].trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

function toolLabel(toolName: string, args: any): string {
  switch (toolName) {
    case "bash":
      return "bash: " + clip(String(args?.command ?? ""), 60);
    case "read":
    case "edit":
    case "write":
      return args?.path ? `${toolName} ${basename(String(args.path))}` : toolName;
    case "Agent":
      return `agent ${args?.subagent_type ?? ""}: ${clip(String(args?.description ?? ""), 50)}`;
    case "web_search":
      return "search: " + clip(String(args?.query ?? args?.queries?.[0] ?? ""), 60);
    case "fetch_content":
      return "fetch: " + clip(String(args?.url ?? args?.urls?.[0] ?? ""), 60);
    default:
      return toolName;
  }
}

export default function (pi: ExtensionAPI) {
  const workspaceId = process.env.CMUX_WORKSPACE_ID;
  const surfaceId = process.env.CMUX_SURFACE_ID;
  if (!workspaceId || !surfaceId) return;
  const cmux = process.env.CMUX_BUNDLED_CLI_PATH || "cmux";

  pi.registerTool({
    name: "notify",
    label: "Notify",
    description:
      "Send the user a cmux notification mid-run. Turn-end notifications are automatic.",
    promptSnippet: "Notify the user in cmux mid-run",
    promptGuidelines: [
      "Use notify only for events the user would want while away: blocked on a decision, CI failed or passed, a new review comment, or a long job finished early.",
      "Do not use notify for routine progress or at the end of a turn.",
      "Set urgent only when the user must act soon.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Short headline, under 60 characters" }),
      body: Type.String({ description: "One or two sentences of detail" }),
      urgent: Type.Optional(Type.Boolean({ description: "Also show a macOS banner" })),
    }),
    async execute(_toolCallId, params) {
      await promisify(execFile)(cmux, [
        "notify",
        "--surface", surfaceId,
        "--title", params.title,
        "--body", params.body,
        "--desktop", String(params.urgent === true),
      ]);
      return { content: [{ type: "text", text: "Notification sent." }], details: undefined };
    },
  });

  const running = new Map<string, string>();
  let sent: string | null = null;
  let wanted: string | null = null;
  let inFlight = false;

  // One cmux call at a time; bursts of tool events collapse into the latest label.
  function flush() {
    if (inFlight || wanted === sent) return;
    const label = wanted;
    const args =
      label === null
        ? ["clear-progress", "--workspace", workspaceId!]
        : ["set-progress", "0", "--label", label, "--workspace", workspaceId!];
    inFlight = true;
    const child = spawn(cmux, args, { stdio: "ignore" });
    const done = () => {
      inFlight = false;
      sent = label;
      flush();
    };
    child.on("error", done);
    child.on("close", done);
  }

  function show(label: string | null) {
    wanted = label === null ? null : clip(label, MAX_LABEL);
    flush();
  }

  function showRunning() {
    const labels = [...running.values()];
    if (labels.length === 0) return show(THINKING);
    const latest = labels[labels.length - 1];
    show(labels.length > 1 ? `${latest} +${labels.length - 1}` : latest);
  }

  // Subagents run as in-process sessions without a UI and report through their parent.
  pi.on("agent_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    running.clear();
    show(THINKING);
  });

  pi.on("tool_execution_start", (event, ctx) => {
    if (!ctx.hasUI || event.parentToolCallId) return;
    running.set(event.toolCallId, toolLabel(event.toolName, event.args));
    showRunning();
  });

  pi.on("tool_execution_end", (event) => {
    if (!running.delete(event.toolCallId)) return;
    showRunning();
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!ctx.hasUI) return;
    running.clear();
    show(null);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!ctx.hasUI) return;
    running.clear();
    show(null);
  });
}
