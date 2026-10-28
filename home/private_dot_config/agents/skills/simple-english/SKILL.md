---
name: simple-english
description: "Write or rewrite technical prose in Simplified Technical English. Use for docs, READMEs, runbooks, PR text, release notes, and error messages, or when the user asks for simple English, plain English, STE, or fewer words."
compatibility: "Works with Claude Code, OpenAI Codex, and Cursor. The optional checker requires Python 3.9 or later."
---

# Simple English

Write clear prose in the style of ASD-STE100 Simplified Technical English. This skill does not guarantee full ASD-STE100 compliance. The official ASD dictionary cannot be redistributed. Use the free NGSL word list (`reference/ngsl-words.txt`) as a guide for plain words.

Preserve the meaning, facts, code, identifiers, commands, paths, product names, and quoted text. The reader is an engineer. Assume they know common programming and engineering terms, tools, and products.

## When to use

Apply this skill when the user asks you to:

- write or rewrite documentation, READMEs, runbooks, PR text, release notes, error messages, or explanations
- use simple English, plain English, Simplified Technical English, or STE
- remove jargon, filler, hedges, or AI-generated wording

Use the same rules in Claude Code, Codex, and Cursor. Do not create client-specific prose rules.

## Agent support

This folder follows the open Agent Skills format. Keep one source folder when possible. Link or copy it into the host's skill directory when needed:

- Claude Code: `.claude/skills/simple-english/` or `~/.claude/skills/simple-english/`
- Codex: `.agents/skills/simple-english/` or `~/.agents/skills/simple-english/`. Some Codex setups use `.codex/skills/simple-english/`.
- Cursor: `.cursor/skills/simple-english/` or `~/.cursor/skills/simple-english/`. Cursor also reads the Claude and Codex locations.

Keep `SKILL.md`, `reference/`, and `scripts/` together. Invoke the skill by its name, or let the agent select it from the description. The checker path is relative to this skill folder, so it does not depend on a Claude-specific home directory.

## Sentences

1. Keep instructions to 20 words. Keep descriptions to 25 words at most.
2. Use active voice. Name the actor.
3. Write one instruction per sentence. Use the imperative mood.
4. Use simple tenses. Avoid perfect and progressive forms.
5. Do not use contractions, semicolons, or em dashes.
6. Keep one topic per paragraph. Use 6 sentences at most.
7. Put a warning before the step it protects: "Do not run this against production."
8. Put a condition before its command: "If the build fails, read the log."

## Words

1. Use the plain word when it is exact: "use", not "leverage". Keep an exact technical term such as `idempotent` or `rebase`.
2. Cut hedges and filler. Prefer a strong verb over an adverb.
3. Avoid metaphors, idioms, and blog words such as "robust", "seamless", and "at its core".
4. Use one name for one concept. Do not vary the name.
5. Bold a Valon term or a name you coin on first use. Define it in the same sentence. Write it plain after that. Do not bold terms the reader already knows.
6. Use `configuration` instead of `config` in prose. Keep `config` in an exact product or code name.

## Exceptions

Put code, paths, commands, and identifiers in backticks. The checker skips them. Use backticks only for real code. Table cells and diagram labels may be fragments. Do not rewrite quoted text.

## Verify

Run the checker on the final text before you send it. Run these commands from the skill folder:

```
python3 scripts/check.py draft.md
printf '%s\n' "the text" | python3 scripts/check.py
```

Exit code 1 means a hard violation: a contraction, a semicolon, or a paragraph over 6 sentences. Fix each hard violation and run the checker again.

Treat each `warn` line as a review question. For `vocab`, keep an exact term the reader knows. Replace it when a plain word works. Bold it when it is new to the reader. Fix `passive`, `perfect tense`, `progressive`, `adverb`, and `wording` warnings unless the rewrite changes the meaning. Stop when the output says `clean` or `no hard violations` and you have reviewed each warning.
