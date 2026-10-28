Launch an autonomous agent for an open-ended, multi-step task. Agent types:
{{compactTypeList}}

Use it for a search across the codebase, independent parallel work, or output too large for this context. For a known path or symbol, use `read` or `grep`.

- Write a self-contained prompt. The agent has not seen this conversation. State the goal and why, what you know or ruled out, whether it may edit files, and the answer size.
- For a lookup, give the exact command. For an investigation, give the question, not steps.
- Do not delegate understanding. Never write "based on your findings, fix it". Name the files, lines, and change yourself.
- For parallel work, send several Agent calls in one message.
- Agents run in the background by default, and you get a notification when one completes. Pass `run_in_background: false` only when your next step needs the result and nothing else can happen first.
- Never predict or invent a pending agent's result. If asked, say it is still running.
- The user does not see the result. Summarize it. Check an agent's code changes before you report work as done.
- `resume` continues an earlier agent by ID. `steer_subagent` messages a running one.{{isolationGuideline}}{{scheduleGuideline}}
