# Memory

- Run the repo formatter and type checker before each push. (2026-11-04, Arijit)
- Before a destructive prod change, propose a plan. (2026-11-02)
- Before resetting a worktree, check for uncommitted changes and save the old head as a backup ref. (2026-11-04)
- In a restack, fetch each PR's remote head and merged state, rebase only open PRs onto their real parent, and set each base before you force-push. A stale base requests every CODEOWNERS team. (2026-11-16)
- Stage files by exact path, never a folder. Manage stacked PRs with `gh stack`. (2026-11-02)
- Reply to a PR comment only after its approved change is pushed. State only the decision or fix, on the line. No commit hashes or item numbers. (2026-11-12)
- Put new checks inside the existing gate block they belong to. (2026-11-16)
- Do not rewrite pushed git history unless asked. (2026-11-16)
