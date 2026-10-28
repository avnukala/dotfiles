# Drawing the diagrams

SKILL.md says which diagram fits which hard part. This file says how to draw each one so that it reads at a glance.

## Each diagram

- **Pipeline**: boxes for stages and solid arrows between them. Put a numbered circle on the midpoint of each arrow, as an `<a href="#sN">` link to its section. Put the payload diff for each hop in that section.
- **Timeline**: one horizontal axis for each actor and a small circle for each event. Mark a commit or cut moment with a dashed vertical line. Shade a blind spot. Draw a crash or cancel as a red X. Draw an event that never arrives as a dotted ghost circle. Mark a grace window with a green bracket.
- **State ladder**: the same record at S0, S1, and S2, side by side. Green is safe, amber is in flight, and red needs a human.
- **Join map**: one box for each table, with only the columns that matter. Draw key columns as ports. A solid line is a foreign key, and a dashed line is a soft match. Write the cardinality (1 or N) at each end.
- **Architecture map**: grey containers for boundaries, with a label on top and white boxes inside. Arrows cross a boundary where the calls cross it. A solid arrow is a sync call, and a dashed arrow is async, an event, or a return.
- **Decision funnel**: inputs or cases in a left column, with arrows that converge on a few exits on the right.
- **Nested boxes**: the inner box is the narrower scope. Shade each box by its precedence.

## Rules for every diagram

- Show one idea in each diagram. If the caption needs two sentences, split the diagram.
- Use at most about 7 boxes or 8 events. If you need more, collapse a group into one container and label it with its role.
- Give each shape one meaning. A box with 3px rounded corners is a thing. A grey container is a boundary. A circle is an event or a hop number. An X is a cancel or a crash.
- Give each line style one meaning. A solid line means data flows. A dashed line means optional, async, a return, or a cut. A dotted ghost means the event never happens.
- Use colour only for a verdict. Blue is the main path, green is safe, amber is in flight, red is a failure or a loss, and grey is context.
- Label each arrow with the data that moves, not with a verb. Put the function name in the box subtitle.
- Route arrows through the gaps between boxes, never through a box. Leave at least 40px between rows. Send return paths around the outside.
- Put timeline labels above and below the axis in turn, so they do not touch.
- Size the viewBox to the content, so that no empty space remains. Use 12px text and 10.5px subtitles.
