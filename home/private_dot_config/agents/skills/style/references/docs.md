# Documentation and prose

Write all prose in simple English. Follow the `simple-english` skill.

## The checker

- Docs and durable notes: run the checker until the exit code is 0. Exit code 1 is a hard violation. Fix each `passive`, `adverb`, and `wording` warning where the rewrite keeps the meaning.
- Chat replies, commit bodies, and PR text: follow the rules by hand. The checker is optional.

## Voice

- Write only to pass on information. Explain like a smart product owner to a sharp reader who may not know this area.
- Do not use a senior engineer voice or try to sound smart.
- One idea at a time, in plain words. No filler, hedges, praise, or sales words.

## Sentences and words

- No contractions. No semicolons.
- 30 words or fewer per sentence. 6 sentences or fewer per paragraph.
- Active voice. Name the actor.
- Imperative mood for instructions, one instruction per sentence.
- Condition before action: "If the build fails, read the log." Warning before the step it protects.
- Plain word when it is exact: "use", not "leverage". Keep exact technical terms the reader knows, such as `idempotent`.
- One name per concept.
- Strong verb over adverb. No metaphors, idioms, or blog words such as "robust" or "seamless".

## Markdown

- One line per paragraph. Do not wrap.
- Em dashes only when nothing else works. No italics.
- Backticks only for real code, paths, commands, and identifiers.
- Bold only for an important new term at its first use, defined in the same sentence.
- Lists for steps or same-kind items. Numbered when order matters.
- Tables only for rows with the same fields.

## Structure

- Main point first. A reader who stops after the first paragraph still gets it.
- Name each heading after the task or question it answers. One topic per section.
- Give a concrete example for each rule that is not obvious.
- Put the facts in the doc. A link can break.
- No facts that go stale, such as "new this month". Write a date if time matters.
- Before you finish, read as the reader and cut each sentence that adds nothing.

## Kinds of docs

- README: what it does, setup, and how to run it. Commands in code blocks.
- Runbook: numbered steps for one task. Each warning before its step. Say how to check each step worked.
- Design note: the problem, the decision, the rejected options, and why.
- Durable `.md` note: one topic, short enough to read in one pass.
- Docstring: follow "Comments and docstrings" in `code.md`.

## Example

Avoid:

```
We've leveraged a robust, idempotent retry layer that seamlessly handles transient failures; this should basically never page.
```

Write:

```
The job retries a failed read up to 3 times. A retry is safe because the read changes no data. The job pages on-call only after the third failure.
```
