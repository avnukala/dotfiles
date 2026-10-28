# Branches

Format: `arijit/<name>`. No other prefix, such as `feature/` or `fix/`.

- Name the outcome in 2 to 4 words, not the implementation. Use the words of the product and the ticket.
- Do not use vague words such as `fix`, `update`, `wip`, or `misc` alone.
- After `arijit/`, use only lower case letters, digits, and single hyphens. Do not start or end with a hyphen.
- Create one branch for one change, from the latest base branch: `git fetch origin && git switch -c arijit/<name> origin/main`.
- If the scope changes, rename with `git branch -m` before you push. If the change splits, use two branches. After you push, keep the name.
- Check that git accepts the name: `git check-ref-format --branch arijit/<name>`.

```
arijit/late-transfer-cutoffs       good
arijit/retry-balance-reads         good
arijit/feature/errors-modal        type prefix
arijit/Processing_Errors_Modal     capitals and underscores
arijit/use-react-portal            implementation, not outcome
arijit/fix                         vague
```
