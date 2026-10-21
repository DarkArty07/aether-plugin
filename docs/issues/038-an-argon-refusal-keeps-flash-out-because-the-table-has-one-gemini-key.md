# An Argon refusal keeps Flash out for 60 minutes because the lane table has one Gemini key

**Type:** bug (design; lane table)
**Date:** 2026-10-21
**Found in:** the Lead's session 7c77db6f, watching the first delegations of 0.14.1; named in [A60](../decisions.md) (4) as a known cost
**Status:** fixed in 0.14.4 (2026-10-21), branch `fix/split-argon-flash`, decision [A69](../decisions.md): the table has `argon` and `flash`; `aether-report` still counts the shared window once per key
**GitHub:** none yet. This file is the local record.

## What happened

agy refused Gemini 4 Argon with «Individual quota reached» (reset in 135 h) while Gemini 3.8 Flash was answering on the same plan. The refusal's mark is per table key, and the table has one key for both models, `gemini`, so for the next 60 minutes the router and the swarm treated Flash as dry too: the three delegates that came next went to Grok, not to Flash, which had just finished three delegates of its own.

The table had one key because agy 1.4.2 shows one `Gemini Models` group in `/usage`. A60 (4) made one `/usage` group able to feed several keys (`groups` maps each key to the `/usage` group it reads, and each key gets the same windows), and said a split into `argon` and `flash` is one line of `config/lanes.json`. The owner approved the split: «si apruebo separar argon de flash, eso es un error de diseño corrígelo también».

## Acceptance

- `config/lanes.json` has the keys `argon` and `flash` for agy, both reading `Gemini Models`; the models and the pairs of `config/pairs.json` point to their own key.
- A refusal of Argon marks `argon` only; Flash stays available, and the other way round. Both keys show the same windows and the same reset.
- A saved reading made with the old keys (`gemini`, `claude`) does not break anything: the router treats it as incomplete until it is renewed, and a mark of the old key `gemini` is ignored.
- Documented, with a decision (A69) and tests.

## Impact

One model's individual limit takes the other model out for an hour: delegation, the D of RADAR, falls to Claude or to another plan without need.
