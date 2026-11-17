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

- Write plain English, as if you explain the PR to a teammate. Keep it short and simple.
- Use few numbers, class names, and terms. Name a class or file only when the reviewer needs it to find the code.
- Say what the code does, not how. Leave out schedules, counts, error strings, retry math, and SQL details.

- Write the description as an explanation to a reader. Use the present tense and say what the code does: "This PR adds", "The cron reads". Use the imperative only inside the Before merge and After merge lists.

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
<What changes and why it matters to the reader, in one to three sentences. No steps.>
<diagram, diff sketch, or tree>

## Context
<Why the change matters, in plain words, for a reader new to this area>

## Changes
<One short paragraph, then bullets. A subheading for each area.>

## Validation
<Tests, checks, and manual steps, one line each. Media. Always for UI changes.>

## Before merge / After merge
- <One step per bullet, imperative, with the exact command>
```

- **Summary**: if the PR has a merge danger, say so in one sentence and point to Before merge. Put a diagram here when it explains the design better than prose.
- **Context**: say why the gap exists in one or two sentences. State facts about the system. Put ordering rules, such as "X must exist before Y deploys", in Before merge or After merge. Do not justify future work. Skip it when the Summary makes the reason clear.
- **Changes**: give each change a bullet, widest scope first. Describe the new thing and its rules as a list. Tell the reviewer what to check. Name what is out of scope only when a reviewer might expect it.
- **Validation**: keep each result to one line. Write an untested case as a fact only when a reviewer would assume it was tested: "Not tested: hover state in Safari."
- **Before merge / After merge**: list only the steps that a person must do by hand. Write one imperative step per bullet. Delete the section when there are no steps.

A short description can be one paragraph:

```
This migration makes `intake_groups.schema_version_id` non-nullable after the PROJ-3935 all-tenant backfill. It is stacked on the Python PR #4821, which must merge first. Merging is safe only when the column has zero nulls.
```

A full description:

```
## Summary
This PR replaces the per-tenant Fannie SFTP cron with one Fannie cron and one Freddie cron that run in the system context. Each cron reads new response files from the agency folder and keeps a record of each file it reads.

## Context
Fannie puts the files for all its servicers in one shared folder, and most of those servicers are not our tenants. One cron that reads the folder once is simpler and safer than one cron for each tenant.

## Changes
- Each cron logs in with the SFTP login from the system configuration.
- Each file gets a row in the Fannie or Freddie file table, so the cron reads each file only once. The cron retries a failed file a few times, then pages once.
- Fannie files go to the tenant that owns the servicer number. The cron skips files from servicers we do not own.
- This PR removes the old tenant cron and its integration.

## Validation
- The `gse_responses` tests and `peach check` pass.

## Before merge
- Merge the configuration PR first, and save both SFTP logins before this PR deploys.
```

## Screenshots and media

1. Capture each visible state that the change affects. Show the behavior, not only the page.
2. Upload each file so that it renders in the PR. Follow `pr-images.md`.
3. Embed each file inline under Validation with `![short description](url)`, after a short caption that states what it proves.

## Review replies

- Write like you talk to the reviewer. Short, plain, casual.
- Start with the decision: "Fixed.", "Kept.", "Removed.", or "Done." Then one reason in a sentence.
- Give the fact. Do not thank the reviewer or apologize.
- No commit hashes and no item numbers.

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
