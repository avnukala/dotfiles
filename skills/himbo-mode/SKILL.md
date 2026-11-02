---
name: himbo-mode
description: 'Builds an HTML explainer that breaks code down to first principles, like an explanation for a five-year-old, with SVG diagrams. Use when the user says "give it to me himbo", or asks for a visual explainer, an ELI5, or a deep-dive of a PR, subsystem, data flow, race condition, or how tables interact.'
---

# himbo-mode

Build one self-contained HTML page that a reader with no context understands on one read. The page starts from facts the reader already knows. It adds one idea at a time, and each idea rests only on the ideas before it. Then it follows one real example through the code. A diagram shows where the reader is. A payload shows what the data looks like at that point.

Use it for code that text, PR descriptions, diffs, or mermaid cannot explain. Diagram kinds: pipelines, timelines, state ladders, join maps, and architecture maps.

Start from `reference/template.html`. Do not write new CSS. Keep colours as the template's CSS variables, and never hardcode hex in the page or the SVG.

## Why a page and not text

- Text makes the reader build the structure in their head.
- A diff or a PR description shows what changed. It does not show how control flows.
- Mermaid shows topology. It does not show the data, the order of events, or the current state.

If text, a diff, or mermaid can do the job, do not use this skill.

## The reader

Write for a smart reader who is new to this codebase and this domain. The reader can read code and knows what a function, a database row, and an HTTP request are. The reader does not know any term from this repository, this team, or this business area.

If a sentence needs a word that the reader does not know, define the word first. If the definition needs another unknown word, define that word first. Keep going down until you reach a fact the reader already knows. That fact is the first principle.

## The first-principles method

Do these steps before you write the page. The page shows the result in the same order.

1. **Start from the goal in plain words.** Say what the code is for, as if the reader never saw the product. Example: "When a borrower pays, we must record the payment exactly once." Do not use a team or domain term in this sentence.
2. **Show the problem before the fix.** Describe the obvious, simple way to do the job. Then show, with a concrete case, how that way fails. The fix only makes sense after the reader sees the failure.
3. **Build the concept ladder.** List every idea that the reader needs to follow the fix. For each idea, ask "what must the reader know to understand this?" Repeat until each answer is a fact the reader already knows. Sort the ideas so that each one rests only on ideas above it.
4. **Explain each rung with a concrete case first.** Show real values, such as one row, one request, or two timestamps. Then give the general rule in one sentence. Then give the name the code uses for it. Concrete, then rule, then name.
5. **Ask "why?" at each claim.** For each statement on the page, ask why it is true. If the answer is not on the page, add it, or link to the rung that holds it. Stop when the answer is a fact the reader knows, such as "two workers can read the same row before either one writes."
6. **Say what breaks.** For each step, say what goes wrong if someone removes it or moves it. A step that the reader cannot connect to a failure looks like noise.

Example of a ladder for a payment job that is safe to retry:

| Rung | Concrete case | Rule | Name in the code |
|------|---------------|------|------------------|
| 1 | The worker crashes after it charges the card but before it saves the result. | A job can stop at any line. | crash |
| 2 | The queue sends the same job again 30 seconds later. | A job that does not confirm it finished runs again. | retry |
| 3 | The retry charges the card a second time. | A retry repeats every side effect that already happened. | double charge |
| 4 | The retry finds `charge_id=ch_1` on the row and skips the charge. | A job that checks for its own earlier result is safe to run twice. | idempotent |

## Process

1. **Look for earlier work.** If the session context names a notes vault, check `<vault>/workstreams/*/explainers/` for a page on the same topic. Check `<vault>/workstreams/*/research/` and `<vault>/wiki/` for related research.
2. **Read the code.** Read the whole diff and the files it hooks into, or the whole subsystem. Trace callers and callees. Do not draw yet.
3. **Name the invariant.** Write the one rule that must always hold, in one sentence. Example: "Each payment row has one ledger entry, even after a retry." If you cannot write it, you do not understand the code yet. Read more.
4. **Run the first-principles method.** Write the plain goal, the naive way and its failure, and the concept ladder. If a rung needs a fact that you cannot get from the code, read more code. Do not guess.
5. **Pick the running example.** Use one small case that hits the edge case that makes the code hard, such as the retry, the null join, or the cancelled stream. Take field names and shapes from the code or from a real run. A payload from a real run is better than one you write by hand.
6. **Pick the tracked item.** This is the one value whose path is the story, such as a request id or a ledger row. Wrap it in `<mark>` every time it appears, in prose and in payloads.
7. **Walk the example through the code.** At each step, write down what the data looks like. This is the spine of the page.
8. **Pick the diagrams.** See "Pick the diagram from the hard part". Use the fewest diagrams that carry the story. Most pages need 1 to 3.
9. **Build the page** from the template.
10. **Verify.** See "Verify". Fix and look again until every check passes.
11. **Deliver.** Write the page to `<vault>/workstreams/<workstream>/explainers/<YYYY-MM-DD>-<topic-slug>.html`. If no vault is set, write it to `~/explainers/<YYYY-MM-DD>-<topic-slug>.html`, and create the folder if it is missing. If a page on the same topic exists, overwrite it. Other agents read this folder later, so keep the file self-contained. Open the page and give the user the path.
    - The workstream is the folder whose `brief.md` lists the ticket. If no workstream fits, use a short ad-hoc slug for the area, such as `fannie-gse-reporting`.
    - The topic slug names the subsystem or the PR.

## Pick the diagram from the hard part

Ask what makes this code hard. The answer picks the diagram. Tell the user in one line why you picked it.

- **The data changes shape as it moves.** Use a pipeline. Each stage is a box, and each hop has a numbered circle that links to its section.
- **The order of events can go wrong**, as with races, retries, cancels, timeouts, and crashes. Use timelines. Several small timelines are better than one big one.
- **The question is which state the record is in now.** Use a state ladder. Draw the same record at S0, S1, and S2, with a one-line predicate under each.
- **Rows from several tables combine.** Use a join map. Show only the columns that matter, the key links, and the cardinality. Then send 2 or 3 real rows through it, with the unmatched row in red.
- **The question is who calls whom.** Use an architecture map, with grey containers for each service or trust boundary.
- **Many cases lead to a few exits.** Use a decision funnel.
- **Scopes nest**, as with config layers or call stacks. Use nested boxes.

Mix them when the code needs it. For example, put an architecture map at the top and a timeline for the one hop that races. Read `reference/diagrams.md` before you draw. It has the shape, line, and colour meanings and the spacing rules.

## Page structure

1. An `<h1>` in plain sentence case, with no team or domain term.
2. **The goal**: one or two lines that say what the code is for, in plain words.
3. **The problem**: the naive way, and one concrete case where it fails. Use a small timeline or state ladder if the failure is about order or state.
4. **Building blocks**: the concept ladder, in order. Give each rung an `<h3>`, the concrete case, the rule in one sentence, and the name the code uses. If each rung fits on one row, use a table instead.
5. **The invariant** in one line, then 2 to 4 bullets for how the code keeps it. Each bullet uses only terms from the building blocks. Add a legend for any marks.
6. The first diagram.
7. One or two lines that set up the running example.
8. One `<h2 id="sN">` for each hop or scenario. Each section has:
   - a `.who` line with the function and the file
   - three bullets: what goes in, what comes out, and what is guarded
   - a payload in a `.file` block, or a small SVG
9. An `<hr>`, then 2 to 4 closing blocks. Each block has a bold lead-in and 1 to 3 bullets. One block must tell the failure story: the worst case, and why the degraded mode is a tradeoff and not a bug.
10. **Check yourself**: 2 or 3 questions that the reader can now answer. Put each answer in a `<details>` element. Example: "What happens if the worker crashes after the charge?"

## Payloads

- Take every field from the code or a real run. Never invent a field.
- Put each code excerpt or payload in a `.file` block, right under the text that discusses it. Highlight the lines that the text discusses.
- **Diff form**, for a pipeline: show the payload at each hop. Use `<span class="add">` for added lines, `<span class="del">` for removed lines, and `<span class="cm">` for comments. Write `[ ...unchanged from N ]` to skip lines that did not change.
- **Snapshot form**, for a state ladder: show the same structure at each state in one block. Label each state and give the predicate for it.

## Writing

The reader must get it on one read. Keep the words plain and the names exact.

- Define each term before its first use. Never use a term and explain it later.
- After you explain a term, use the name that the code uses. Then use only that name. Do not switch between synonyms.
- Lead with one line, then bullets. Use a paragraph only for the "why", and keep it to 3 sentences.
- Put one fact on each line. If a sentence has a second "and", "but", or "so", split it.
- Give real values, not placeholders. Write "row 42 has `charge_id=ch_1`", not "the row has a charge id".
- Use a table to compare 3 or more things on the same fields.
- For each load-bearing step, say what breaks if someone reorders it or removes it.
- For each loss or degraded mode, give the tradeoff in one line.
- Do not skip a step because it is obvious to you. If the reader needs it to follow the next line, write it.
- Do not use analogies or themed jokes. The concrete case from the code is the explanation.

Example. Before:

> Three tables are involved. portfolios gains one column. The other two hang off portfolios.sid through portfolio_sid, and no model declares a ForeignKey, so every join is a soft match.

After:

```html
<p>Three tables are involved:</p>
<ul>
  <li><code>portfolios</code> gets one new column.</li>
  <li>The other two tables each store a <code>portfolio_sid</code> that holds the <code>sid</code> of a portfolio.</li>
</ul>
<p>A <strong>foreign key</strong> is a database rule that a stored id must match a real row in another table. No table here declares one.</p>
<p>The database lets a loan store <code>portfolio_sid=7</code> even if no portfolio has <code>sid=7</code>.</p>
<ul><li>Result: a loan can point at a portfolio that does not exist.</li></ul>
```

## Verify

1. Open the page. If a browser tool is available, such as claude-in-chrome or Playwright, take screenshots at desktop width and at about 700px. If not, run `open <file>`.
2. Check each item:
   - Each term has a definition before its first use.
   - Each rung of the ladder rests only on rungs above it.
   - The problem section shows a concrete failure before the page shows the fix.
   - The page answers "why?" for each claim.
   - No text touches a line or another label.
   - No arrow passes through a box.
   - No SVG has empty space under it.
   - Each `.file` block highlights the lines that the text discusses.
   - Each numbered circle sits on its arrow and links to the right section.
   - Each payload field matches the code.
   - No block is longer than 3 sentences.
3. Read the page from the top as the new reader. Mark each place where you had to guess. Fix each one.
4. Fix each problem and look again. Do not hand over a page that you have not seen rendered.

## Do not

- Do not draw what the bullets already say.
- Do not add a diagram to each section only for symmetry.
- Do not use colour as decoration. Do not use gradients, shadows, or icons.
- Do not add JavaScript or external assets. The page must open offline.
