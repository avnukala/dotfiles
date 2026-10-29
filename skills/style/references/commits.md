# Commits

These rules apply to every coding agent: Claude Code, Codex, and Cursor.

## Subject

- Use the imperative mood. The subject completes "If applied, this commit will ...".
- Name the change in the smallest accurate plain words.
- Cut words that add nothing, such as "update", "code", "logic", "changes", "various", and "minor".
- Capitalize the first word. No final period.
- Aim for 50 characters. Never exceed 72.
- No ticket reference (the PR title carries it), type prefix, scope, tag, metadata, or emoji.
- Do not flag the change as "unverified".
- Write an identifier as code, in backticks: ``Add `remittance_sub_type` to portfolios``, not "Add remittance sub type to portfolios".

```
Good: Retry portfolio balance reads without action cutoff
Bad:  Fixed bug                               past tense, vague
Bad:  feat(ledger): add freeze                type prefix and scope
Bad:  PROJ-1153: Add processing errors modal  ticket reference
Bad:  Update logic to retry the balance reads   filler words
```

## Body

- Add a body only when the subject and the diff cannot carry the reason.
- Keep the body to 3 lines or fewer. If the reason needs more, it belongs in the PR description.
- Put one blank line after the subject. Wrap at 72 characters.
- Explain what was wrong and why this change fixes it. The diff shows how.
- Write current behavior in the present tense.
- Follow `docs.md`. The checker is optional for a commit body.

```
Retry portfolio balance reads without action cutoff

Balance reads fail when a portfolio has no action cutoff yet. This
happens for every portfolio in its first day after onboarding. Retry
the read without the cutoff, so the first-day balance still loads.
```

## Agent attribution

Never add agent attribution to a commit. Some tools add trailers despite settings, so check after each commit or amend, and before you push:

```
git log -1 --format=%B | grep -inE 'co-authored-by|generated with|made with|made-with|claude|codex|cursor|session'
```

The pattern also matches normal words such as "session", so read each line. Remove real attribution with `git commit --amend`, then check again.

To check a whole branch, use `git log --format=%H%n%B <base>..HEAD` with the same `grep`. To strip attribution from every commit on it:

```
git rebase --exec 'git log -1 --format=%B | grep -viE "co-authored-by: *(claude|codex|cursor)|generated with|made with|made-with|claude-session|claude\.ai/code" | git commit --amend --no-verify -F -' <base>
```

Check again, then push with `git push --force-with-lease`.

## History

- Give each commit one intent. Keep a refactor apart from a change in behavior.
- Make the history a deliberate sequence, not checkpoints or noise.
- For a messy branch, propose a clean linear rewrite before the merge.
- When you amend or rebase, keep the intended change and rewrite the message in this style.

## Before you commit

1. Read the staged diff. Confirm it follows "Scope of a change" in `code.md`: no format churn, no hunks that change nothing.
2. Write the subject, and a body only if needed.
3. Show Arijit the staged files and the full message in one block, and ask to commit. Wait for an explicit yes. This also applies to an amend or a rebase that rewrites a message. The watch-pr skill is the only exception.
4. If Arijit edits the message, use his text as written.
5. Commit, then run the agent attribution check.

```
Staged (2 files):
  dot
  README.md

Retry portfolio balance reads without action cutoff

Commit with this message? (yes / edit)
```

## Basis

Chris Beams, "How to Write a Git Commit Message"; Git "SubmittingPatches"; Tim Pope, "A Note About Git Commit Messages"; Google, "Small CLs".
