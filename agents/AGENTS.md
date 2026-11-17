# Global agent instructions

## Style

Load the `style` skill before you write code, comments, tests, branch names, commits, PRs, or docs.

## Coding

- Trace behavior and invariants before you edit. Fix root causes.
- Prefer these options in this order:
  1. Reuse existing behavior, types, enums, and fields. Add no field that duplicates another.
  2. Extend the layer that owns it.
  3. Use the stdlib, platform, or an installed dependency.
  4. Add new code where the invariant belongs.
  5. Refactor only when the structure blocks clear ownership.
- Optimize total complexity, not lines changed. No speculative features, single-implementation interfaces, or configuration for fixed values.
- Add no mixin, base class, shared helper, or unused parameter without two callers now. Inline a single-use helper.
- Never trade away validation, auth, security, data-loss prevention, error handling, accessibility, migration safety, concurrency protection, compatibility, or required tests.
- Ask only about public, security, data, billing, or hard-to-reverse choices.
- Run the smallest sufficient proof. Report the changes, the proof, and the risks.

## Sub-agents

- Send one Explore agent per question that needs more than 2 searches. Run independent ones in parallel, in one message.
- Give each: the question, the repo or folders, breadth ("quick", "medium", "very thorough"), and answer size.
- Search yourself only for a known path or symbol. No nested delegation.
- Sub-agents return findings, file refs, open questions, and confidence, not raw logs. Source code overrides their summaries.

## Memory

- Lessons live in `~/.config/agents/MEMORY.md` for all work and `~/valon/MEMORY.md` for work under `~/valon`. pi loads them. In other harnesses, read the files that apply before you start.
- Put each lesson in one place. A fixed rule that every session in a repo needs goes in that repo's `AGENTS.md`.
- When Arijit corrects you, or confirms an approach that is not obvious, add one line to the file that owns its scope: `- <target behavior>. (<YYYY-MM-DD>, <source>)`.
- Keep each file under 50 lines. Merge or replace a line when it is full.
- A rule for the code of one workstream goes in the brief's `## Rules for code`. A procedure goes in a skill.
- In other harnesses, ask Arijit before you edit memory.
- Do not record facts that the code, git, Linear, or a skill already shows.
