---
name: watch-pr
description: Watches an open GitHub PR and fixes new review comments, failed CI checks, and merge conflicts until it merges or closes. Use when the user asks to watch, monitor, babysit, or shepherd a PR, or keep it green.
---

# watch-pr

Watch one PR in a loop. `scripts/watch.py` polls GitHub without output and exits only when there is something new to act on. You act on it, then start the script again.

## Why this design

- One GraphQL call per poll reads comments, reviews, threads, checks, and merge state. At the default 30 second interval, this uses about 120 of the 5000 GraphQL points per hour.
- The script prints nothing while it waits, so the wait adds no context. Do not poll with `sleep` loops or repeated `gh pr view` calls in the session.
- The script stores the events it reported in `~/.cache/watch-pr/<owner>-<repo>-<number>.json`. Each run reports only new events, including events that came in while you fixed the last batch.
- The script skips comments and threads by the `gh` user, so your own replies do not wake you.

## Run the watcher

Run from the repository worktree that has the PR branch checked out. Give the Bash tool a timeout longer than `--timeout`.

```bash
python3 ~/.config/agents/skills/watch-pr/scripts/watch.py <number-or-url> --timeout 1500
```

| Exit code | Meaning | Next step |
|-----------|---------|-----------|
| 0 | New events printed as JSON | Handle them, then run the watcher again |
| 2 | PR merged or closed | Stop and report |
| 3 | Timeout with no events | Run the watcher again |
| 1 | `gh` failed 5 times in a row | Run `gh auth status`, then stop and report |

The first run reports everything that is open now: unresolved threads, failed checks, and old comments. Later runs report only new events.

## Handle the events

Handle all events in one batch, then make one commit for the batch.

| Event `type` | Action |
|--------------|--------|
| `check_failed` | For a GitHub Actions job, read the log with `gh run view --job <job-id> --log-failed`. The job ID is the last number in `url`. Reproduce the failure locally, fix the root cause, and run the same check locally. |
| `thread` | Read the code at `path` and `line`. If the request is clear and in scope, make the change. Reply in the thread with what you changed. |
| `review` | If `state` is `CHANGES_REQUESTED` or `body` asks for a change, treat it like a thread. `APPROVED` with no body needs no action. |
| `comment` | Act only if a person asks for a change. Ignore bot boilerplate, such as Trunk merge notes, Linear links, and deploy previews. |
| `merge_conflict` | Merge the base branch into the PR branch, resolve the conflicts, and run the tests for the files that conflicted. |
| `checks_passed` | No action. Tell the user CI is green for that commit. |

## Push the fix

1. Load the `style` skill before you write code, a commit, or a reply. Follow the `AGENTS.md` of the repository.
2. Run the local checks that cover the changed files.
3. Commit and push to the PR branch. Never force-push and never rewrite commits that are already on the remote.
4. Reply to each thread you fixed: `gh api repos/<owner>/<repo>/pulls/<number>/comments/<comment-id>/replies -f body='<what changed>'`. The comment ID is the number after `#discussion_r` in `url`.
5. Do not resolve threads. The reviewer resolves them.
6. Run the watcher again.

## Stop and ask the user

Stop the loop and ask the user when one of these is true:

- A reviewer asks for a design change, disagrees with the approach, or asks a question that only the author can answer.
- The fix needs a change outside the scope of the PR, or a `peach` command, a migration, or a secret.
- The same check fails 3 times after your fixes, or you cannot reproduce a failure locally.
- A failure looks flaky and does not touch the PR's code. Rerun it once with `gh run rerun <run-id> --failed`. If it fails again, ask.
- You pushed 5 fix commits in this session.

## Reset the watch

To report every open event again, delete the state file for the PR:

```bash
rm ~/.cache/watch-pr/<owner>-<repo>-<number>.json
```
