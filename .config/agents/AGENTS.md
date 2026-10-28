# Global agent instructions

## Style

Load the `style` skill before you write any code, comment, test, branch name, commit, PR, or documentation. Never add agent attribution to commits or PRs.

## Coding

- Trace behavior and invariants before you edit. Fix root causes.
- Prefer these options in this order:
  1. Reuse existing behavior.
  2. Extend the layer that owns it.
  3. Use the stdlib, platform, or an installed dependency.
  4. Add new code where the invariant belongs.
  5. Refactor only when the structure blocks clear ownership.
- Optimize total complexity, not lines changed. No speculative features, single-implementation interfaces, or configuration for fixed values.
- Never trade away validation, auth, security, data-loss prevention, error handling, accessibility, migration safety, concurrency protection, compatibility, or required tests.
- Ask only about public, security, data, billing, or hard-to-reverse choices.
- Run the smallest sufficient proof. Report the changes, the proof, and the risks.

## Sub-agents

- Do small tasks, known targets, and final judgment yourself. Delegate only to save main context. No nested delegation.
- Sub-agents return key findings, file references, open questions, and confidence. They do not return raw logs or full files.
- Source code and tool results override sub-agent summaries.

## Memory

- Lessons live in `~/.config/agents/MEMORY.md` for all work, and in the `MEMORY.md` of the folder that holds a work repository, for the repositories in that folder. pi loads both. In other harnesses, read them before you start.
- When Arijit corrects you, or confirms an approach that is not obvious, add one line to the file that owns its scope: `- <target behavior>. (<YYYY-MM-DD>, <source>)`.
- Each file holds at most 15 lines. When it is full, merge or replace a line.
- A rule for the code of one workstream goes in the brief's `## Rules for code`. A procedure goes in a skill.
- In pi, the vault extension asks Arijit to approve the edit. In other harnesses, ask Arijit before you edit.
- Do not record facts that the code, git, Linear, or a skill already shows.
