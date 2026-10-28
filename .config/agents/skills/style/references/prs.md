# Pull requests

## Scope

- Open one PR. Open a PR stack only when the user asks for one.
- If the diff is large or mixes unrelated changes, suggest a split. Do not split without approval.
- Write all PR text in simple English. Follow `docs.md`.

## Before you write

1. Check the branch and the base branch. Read the diff.
2. Find the Linear ticket from the branch name or the commits, or ask the user.
3. Collect the evidence: test results, check results, and media for any visible change.
4. Find the blast radius and any merge danger, such as a migration that needs zero nulls first, a stacked PR that must merge first, or a flag that must be on.

## Title

- Start with the Linear ticket when you have one: `PROJ-1153: Add Processing Errors modal for failed bulk uploads`.
- Then write a short imperative verb phrase that names the central outcome. Do not describe how you built it.
- Capitalize the first word. Keep the rest lower case, except names and product terms.
- Write an identifier as code, such as `remittance_sub_type`. Do not turn it into words.

## Description

Write for a reviewer who has little time.

- Use domain and product language. Tie each point to the code that it touches.
- Put the facts in the description. Do not rely on a link alone.
- Cut every sentence that does not help the reviewer.
- Do not add hedge labels such as "unverified". Do not list what the PR did not test, unless a reviewer would assume it was tested. Then state it once, as a plain fact, under Validation.
- Cut what the reviewer sees in the diff, such as file registration, config edits, regenerated files, and test moves.
- Cut notes about other PRs, future work, and decisions made in chat.
- Before the merge, read the description again. Update it if the PR changed.

Use this template. Delete the sections that do not apply.

```
## Summary
<What the PR does, then what behavior changes, the blast radius, and any merge danger. Keep it to one or two sentences.>
<diagram, diff sketch, or tree>

## Context
<Why the change matters, in plain words, for a reader new to this area>

## Changes
<One short paragraph, then bullets. A subheading for each area.>

## Validation
<Tests, checks, and manual steps, one line each. Media. Always for UI changes.>
```

- **Summary**: put a merge danger first, such as "Verify zero nulls before you merge." Put a diagram here when it explains the design better than prose.
- **Context**: say why the gap exists in one or two sentences. Do not justify future work. Skip it when the Summary makes the reason clear.
- **Changes**: give each change a bullet, widest scope first. Describe the new thing and its rules as a list. Tell the reviewer what to check. Name what is out of scope only when a reviewer might expect it.
- **Validation**: keep each result to one line. Write an untested case as a fact only when a reviewer would assume it was tested: "Not tested: hover state in Safari."

A short description can be one paragraph:

```
Makes `intake_groups.schema_version_id` non-nullable after the PROJ-3935 all-tenant backfill. This one-table migration is stacked on the Python PR #4821. Verify zero nulls before you merge it.
```

## Screenshots and media

1. Capture each visible state that the change affects. Show the behavior, not only the page.
2. Upload each file so that it renders in the PR. Follow `pr-images.md`.
3. Embed each file inline under Validation with `![short description](url)`, after a short caption that states what it proves.

## Agent attribution

Never add agent attribution to the title, the description, or the merge commit. Settings do not stop every footer, so check at three points.

1. Before you open the PR, read the full description and remove any attribution that a tool added.
2. After you open the PR, run the check below. Read each printed line, because the pattern also matches normal words. Remove real attribution with `gh pr edit --body-file <file>`, then check again.

   ```
   gh pr view --json title,body | grep -inE 'co-authored-by|generated with|created with|made with|claude|codex|cursor|session'
   ```

3. Before a squash merge, write the merge message yourself. The default message carries every commit message and trailer, and a cloud agent can add its own trailer. Use the PR title as the subject, check the body for attribution, and pass both:

   ```
   gh pr merge <number> --squash --subject "<PR title>" --body "<clean body>"
   ```
