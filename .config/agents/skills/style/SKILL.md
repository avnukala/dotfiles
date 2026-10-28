---
name: style
description: "Arijit's style for code, comments, tests, branch names, commits, PRs, and docs. Load it before you write any of those. Skip it for data, config, and pi or agent settings files. Load it if the user asks to apply the style in hindsight."
---

# Style

Arijit's rules for code, branches, commits, PRs, and prose, in every project and every agent.

## Scope

This skill covers only the outputs below. Skip it for data and config files, such as `.json`, `.yaml`, `.toml`, `.lock`, and `.env`. Skip it for pi and agent settings, such as files under `~/.pi/agent/` and `~/.config/agents/`.

## Load before you write

Read only the reference for the output you produce. Load `SKILL.md` first, then the matching row. A code change that ends in a PR needs the rows for code, branch, commits, and PR text.

| Output | Reference |
|--------|-----------|
| Code, comments, docstrings, tests | `references/code.md` |
| Branch name | `references/branches.md` |
| Commit message and history | `references/commits.md` |
| PR title, description, merge | `references/prs.md` |
| Screenshots or recordings in a PR | `references/pr-images.md` |
| Prose: README, runbook, note, chat reply, commit body, PR text | `references/docs.md` |

## Check for DEPRECATED before you edit

Before you edit or add to a file, read the docstring and header of each class, function, and test helper that you will touch. Run `grep -n DEPRECATED <file>` when unsure. If a component is marked DEPRECATED, do not add code or tests under it. Read the guidance in the marker and use the named replacement. See "Scope of a change" in `references/code.md`.

## Check after you edit

Run the repository formatter and linter. Reread the matching reference and fix each violation in the diff.

## In hindsight

If the user asks to apply the style "in hindsight", you loaded the skill too late:

1. Reread the reference for each kind of output the work produced.
2. Redo every part that breaks a rule, not only the surface.
3. Tell the user you missed the skill and list what you changed.

## Terms

- **Agent attribution**: any text that names a coding agent as author or tool: a `Co-authored-by: Claude` trailer, a "Generated with Claude Code" footer, a `Claude-Session` trailer, a session link. Never allowed.
- **The checker**: `python3 ~/.config/agents/skills/simple-english/scripts/check.py <file>`.
- **Base branch**: the branch the PR merges into.
- **The diff**: the full change against the base branch, not only the last commit.

## Conflicts

Project rules (`CLAUDE.md`, `AGENTS.md`, repository conventions) win on concrete points. Tell the user when they do.
