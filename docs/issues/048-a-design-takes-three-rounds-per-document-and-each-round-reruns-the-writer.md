# A design takes three rounds per document and each round reruns the Writer

**Type:** performance (design; the round limit)
**Date:** 2026-10-21
**Found in:** the design runs of specs 010 (97 minutes, 123 agents) and 011 (about 95 minutes)
**Status:** open
**GitHub:** none yet. This file is the local record.

## What happened

Both designs used all the rounds the workflow allows: the spec passed on round 3 in the 011 (revise, revise, approve) and the plan needed three too (revise, revise, and the third judged at 13:46), after the 010's spec and plan ended in `dispute` once. A round is a Writer (3 to 29 minutes) plus a Judge (about 3). The Writer of a revision gets the whole message again and rewrites its documents; the cost does not shrink with the size of the Judge's findings (the plan's third version took 8 minutes for findings that were few, the second 29 for findings about the same size).

## Ideas

Give the revision round only the findings and the lines they touch, and ask for an edit, not a rewrite; start the Judge on the plan while the Examiner already works from the approved spec (the exam depends on the spec and the plan, so only the last part overlaps); and measure the rounds in the workflow's own result (issue 043).

## Impact

Most of the 95 minutes. A smaller number of smaller rounds is the biggest gain available.
