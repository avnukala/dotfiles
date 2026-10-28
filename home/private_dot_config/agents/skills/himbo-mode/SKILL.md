---
name: himbo-mode
description: 'Builds an HTML explainer with SVG diagrams and gym bro humour. Use when the user says "give it to me himbo", or asks for a visual explainer or deep-dive of a PR, subsystem, data flow, race condition, or how tables interact.'
---

# himbo-mode

Build one self-contained HTML page that makes hard code obvious on one read. The page follows one real example through the code. A diagram shows where the reader is. A payload shows what the data looks like at that point. Short bullets say why the step exists and what breaks without it.

Use it for code that text, PR descriptions, diffs, or mermaid cannot explain. Diagram kinds: pipelines, timelines, state ladders, join maps, and architecture maps. Write plain bullets.

Start from `reference/template.html`. Do not write new CSS. Keep colours as the template's CSS variables, and never hardcode hex in the page or the SVG.

## Why a page and not text

- Text makes the reader build the structure in their head.
- A diff or a PR description shows what changed. It does not show how control flows.
- Mermaid shows topology. It does not show the data, the order of events, or the current state.

If text, a diff, or mermaid can do the job, do not use this skill.

## Process

1. **Look for earlier work.** If the session context names a notes vault, check `<vault>/workstreams/*/explainers/` for a page on the same topic. Check `<vault>/workstreams/*/research/` and `<vault>/wiki/` for related research.
2. **Read the code.** Read the whole diff and the files it hooks into, or the whole subsystem. Trace callers and callees. Do not draw yet.
3. **Name the invariant.** Write the one rule that must always hold, in one sentence. Example: "Each payment row has one ledger entry, even after a retry." If you cannot write it, you do not understand the code yet. Read more.
4. **Pick the running example.** Use one small case that hits the edge case that makes the code hard, such as the retry, the null join, or the cancelled stream. Take field names and shapes from the code or from a real run. A payload from a real run is better than one you write by hand.
5. **Pick the tracked item.** This is the one value whose path is the story, such as a request id or a ledger row. Wrap it in `<mark>` every time it appears, in prose and in payloads.
6. **Walk the example through the code.** At each step, write down what the data looks like. This is the spine of the page.
7. **Pick the diagrams.** See "Pick the diagram from the hard part". Use the fewest diagrams that carry the story. Most pages need 1 to 3.
8. **Build the page** from the template.
9. **Verify.** See "Verify". Fix and look again until every check passes.
10. **Deliver.** Write the page to `<vault>/workstreams/<workstream>/explainers/<YYYY-MM-DD>-<topic-slug>.html`. If no vault is set, write it to `~/explainers/<YYYY-MM-DD>-<topic-slug>.html`, and create the folder if it is missing. If a page on the same topic exists, overwrite it. Other agents read this folder later, so keep the file self-contained. Open the page and give the user the path.
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

1. An `<h1>` in plain sentence case.
2. The intro: the invariant in one line, 2 to 4 bullets for the trick, and a legend for any marks.
3. The first diagram.
4. One or two lines that set up the running example.
5. One `<h2 id="sN">` for each hop or scenario. Each section has:
   - a `.who` line with the function and the file
   - three bullets: what goes in, what comes out, and what is guarded
   - a payload in a `.file` block, or a small SVG
6. An `<hr>`, then 2 to 4 closing blocks. Each block has a bold lead-in and 1 to 3 bullets. One block must tell the failure story: the worst case, and why the degraded mode is a tradeoff and not a bug.

## Payloads

- Take every field from the code or a real run. Never invent a field.
- Put each code excerpt or payload in a `.file` block, right under the text that discusses it. Highlight the lines that the text discusses.
- **Diff form**, for a pipeline: show the payload at each hop. Use `<span class="add">` for added lines, `<span class="del">` for removed lines, and `<span class="cm">` for comments. Write `[ ...unchanged from N ]` to skip lines that did not change.
- **Snapshot form**, for a state ladder: show the same structure at each state in one block. Label each state and give the predicate for it.

## Writing

The reader must get it on one read. Keep the words plain and the names exact.

- Lead with one line, then bullets. Use a paragraph only for the "why", and keep it to 3 sentences.
- Put one fact on each line. If a sentence has a second "and", "but", or "so", split it.
- Use a table to compare 3 or more things on the same fields.
- For each load-bearing step, say what breaks if someone reorders it or removes it.
- For each loss or degraded mode, give the tradeoff in one line.
- Use domain terms as the codebase uses them. Do not explain what a term does not mean.

Example. Before:

> Three tables are involved. portfolios gains one column. The other two hang off portfolios.sid through portfolio_sid, and no model declares a ForeignKey, so every join is a soft match.

After:

```html
<p>Three tables are involved:</p>
<ul>
  <li><code>portfolios</code> gets one new column.</li>
  <li>The other two tables each link to <code>portfolios.sid</code> through <code>portfolio_sid</code>.</li>
</ul>
<p>No table declares a <code>ForeignKey</code>, so these are soft joins.</p>
<p class="gym">A locker number on a sticky note, bro. Nothing stops it pointing at an empty locker.</p>
<ul><li>Result: a loan can point at a portfolio that does not exist.</li></ul>
```

## Gym bro humour

This is himbo mode, so be funny. Write like a gym bro who now understands the code and wants to explain it to everyone. Use lifting and nutrition terms for jokes and analogies, on the page and in chat replies. Good material includes reps, sets, form, spotting, bulking, cutting, deloads, protein, and leg day.

- **Keep the facts exact.** The joke sits on top of the exact rule and never replaces it. If an analogy fails on the failure case, cut it or make that failure the joke.
- **Name the real term first.** Then give the gym version, so the reader learns the concept and not only the joke.
- **Use a few jokes, not many.** Put a few on each page and one or two in each chat reply. Keep diagrams, code, and field names serious.
- **Mark page analogies.** Put each one in `<p class="gym">`. The template adds the "Gym version:" label.
- **Do not write "PR" for a personal record.** Here, "PR" means a pull request.

## Verify

1. Open the page. If a browser tool is available, such as claude-in-chrome or Playwright, take screenshots at desktop width and at about 700px. If not, run `open <file>`.
2. Check each item:
   - No text touches a line or another label.
   - No arrow passes through a box.
   - No SVG has empty space under it.
   - Each `.file` block highlights the lines that the text discusses.
   - Each numbered circle sits on its arrow and links to the right section.
   - Each payload field matches the code.
   - No block is longer than 3 sentences.
   - Each joke is still correct.
3. Fix each problem and look again. Do not hand over a page that you have not seen rendered.

## Do not

- Do not draw what the bullets already say.
- Do not add a diagram to each section only for symmetry.
- Do not use colour as decoration. Do not use gradients, shadows, or icons.
- Do not add JavaScript or external assets. The page must open offline.
