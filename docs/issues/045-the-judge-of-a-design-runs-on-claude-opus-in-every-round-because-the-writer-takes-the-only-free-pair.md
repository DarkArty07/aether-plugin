# The Judge of a design runs on Claude Opus in every round, because the Writer takes the only free pair

**Type:** performance and policy (design seats; the owner's rule that Claude is the reserve)
**Date:** 2026-10-21
**Found in:** the design runs of specs 010 and 011
**Status:** open
**GitHub:** none yet. This file is the local record.

## What happened

Every Judge round of the 011 design (3 of the spec, 3 of the plan so far) ended `no-external` and ran on native Opus at `high`: 53.6 points are asked and the pairs that reach them are Gemini 4 Argon (out of quota, or refusing at the start) and Muse (the author rule keeps a Judge from being the model that wrote the document, and Muse wrote it). It is the same in the 010 design (6 of 7 rounds). Each round costs about 3 minutes and Claude's quota, the reserve of an autonomous run.

## Ideas

Choose the Writer with the Judge in mind: when only one external pair can judge, the Writer should be another pair (Grok writes, Muse judges), so that the one that can judge is free. The Writer asks for 46.8 points and has more candidates (Grok, Muse, Argon); the Judge asks for 53.6 and has one or two. That is a change in the order of the seat choices of `lib/seats.js` (choose the scarce seat first, or exclude from the Writer's candidates the pair the Judge will need), not in the rule of the choice function.

## Impact

Claude Opus in six rounds per design; the owner's priority is that this is the last resort. The time saved is small (a native Judge is fast); the quota saved is the point.
