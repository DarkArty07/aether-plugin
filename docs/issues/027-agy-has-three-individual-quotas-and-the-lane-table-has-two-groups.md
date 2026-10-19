# agy has three individual quotas and the lane table has two groups, so one exhausted model can leave the others out

**Type:** bug (lanes, quota, router)
**Date:** 2026-10-19
**Found in:** the owner's question of why a read-only delegate went to neither agy nor grok, in the Lead's session e591573c
**Status:** fixed in 0.12.5 (decision A60), but its premise changed the same day: see «Update». The origin of the mark found in the owner's session was not traced.
**GitHub:** not filed

## What happened

- The owner, who knows the agy plan: «agy tiene 3 cuotas en realidad. 1: Argon 2: Flash 3: Opus Sonnet. Eso sí es un bug nuestro, el código no está adaptado». Of those, he wants to spend Argon and Flash: «no me interesan la cuota de esos modelos [Claude en agy] porque agy da muy poquito de modelos claude, me interesa mucho gastar la cuota de Argon y Flash».
- `aether-lane quota agy --json` (2026-10-19 19:06 UTC) reports two groups, `gemini` («Gemini Models») and `claude` («Claude and GPT models»), each with a weekly and a 5-hour window. Argon and Flash cannot be told apart in the reading.
- `config/lanes.json` gives both `gemini-3.8-flash` and `gemini-4-argon` the group `gemini`. A mark is one file per harness and group (`lanes/marks/agy__gemini.json`), so it holds both.
- That file says `at` 2026-10-16 06:17 UTC, `until` 2026-10-22 23:46 UTC, `confirmed: false`. Four Judge-seat calls on `gemini-4-argon-high` were refused on 2026-10-16 between 04:23 and 04:49 UTC with `Individual quota reached... Resets in 163h` while the group read 99 % (issue 021). The mark's date and length are not those refusals', and the log line that wrote it was not found: its origin is not traced.
- A read-only delegate (explore, level B) with `lanes` on stayed on Claude Haiku `high`. The router's quota step listed `agy gemini-3.8-flash medium` as `excluded`, why `mark`, note «marca vigente; la lectura con saldo no la desmiente», and the agy `claude` group as `unserved`, `no-rung`.

## Why

The group is at once the unit of the reading, of the mark and of the order. With one reading for two quotas, one refusal or one odd reading takes both out for days (issue 015 is the same shape).

## Impact

- `gemini-3.8-flash`, the only agy rung of level B that the router can use, and the swarm's Haiku implementer lane, are out whenever Argon, the design seats' model, is out, and the other way round.
- No quota of the owner's other plans is spent on those calls; they run on Claude. Nothing is lost.

## Proposals

1. Three table groups, `argon`, `flash` and `claude`. The `groups` map keeps saying which `/usage` group a key reads, so `argon` and `flash` both read «Gemini Models» and show the same windows. Marks, order and choice stay per key.
2. A refusal marks the group of the model it refused until the reset it states (the second half of issue 021).
3. An existing mark file of a group that is no longer in the table is ignored without error.
4. The `claude` group stays as it is. The router already leaves its rungs out (`native-measure-only`) and the owner does not want that quota spent.

## Acceptance

- A refusal of Argon leaves `gemini-3.8-flash` usable, and the other way round.
- Two keys can read one `/usage` group.
- The old `agy__gemini.json` is ignored by `aether-lane quota`, `status` and the router.

## Update (2026-10-19, later): agy now shows one Gemini quota

- The owner, looking at agy's own screen: «primero no metieron la cuota de Argon junto la de Flash y la separaron y ahorita que estoy evaluando ya metieron la cuota de Argon junto con la de Flash». The screen of agy 1.4.2 lists two groups: «Gemini Models» (Gemini Flash, Gemini Pro; weekly 98.92 %, 5 hours 98.88 %) and «Claude and GPT models» (Claude Opus, Claude Sonnet, GPT-OSS; weekly 32.92 %).
- The structure the owner described, which the four Argon refusals of 2026-10-16 (agy 1.3.6) fit, does not hold today. The agy binary was replaced on 2026-10-19 at 12:36 local time (1.4.2); whether that is the cause is not known. The three real calls below moved the 5-hour window from 100 % to 98.88 %, which fits one shared pool.
- Still true: marks and refusals are per group, the old mark `agy__gemini.json` held a pool that works, and the reset agy stated proved unreliable. No longer true: that Argon and Flash have separate quotas. The three keys of the table describe the old structure; they are harmless, because both read the same windows. On the branch the table is back to one `gemini` group (the owner left that choice to the Lead: «decido lo mejor»), and the mechanism that lets several keys read one `/usage` group stays, so a later split is one line of `lanes.json`. The old mark was moved aside on 2026-10-19 with the owner's yes («esta bien borrar la marca vieja»); the installed plugin showed the Gemini group usable right after. The owner also asked that stale marks heal by themselves («eso debería ser automático [...] porque a veces llegan los resets de los proveedores y no avisan»): decision A60 now has marks of 60 minutes after a refusal, a healthy reading that lifts a mark that came from a reading (issue 015), and a cap of 60 minutes on an unconfirmed mark.
- The fix was built on a fact about a third party's service that was a few days old, before any real probe (issue 029).

## Evidence from real calls (2026-10-19, about 19:35 UTC)

Three real calls with `scripts/lane-smoke.js` (the owner approved them and asked that the Lead make them), each one file written in an empty directory, all `ok: true`:

| Model | Effort | Seconds | Tokens |
|---|---|---|---|
| `gemini-3.8-flash` | low | 8.6 | 24,408 |
| `gemini-4-argon` | low | 16.8 | 14,384 |
| `gemini-4-argon` | high | 48.7 | 14,849 |

- Flash works while the installed plugin still holds the `gemini` group dry until 2026-10-22: the three-keys split is needed.
- **Argon works too, 3 days into a reset that agy stated as 163 h.** The four refusals of 2026-10-16 (04:23 to 04:49 UTC) were on `gemini-4-argon-high` and said `Resets in 163h`. The stated reset did not hold, or the limit was lifted. A mark that lasts until the stated reset (decision A60, up to 8 days) would have kept a working model out for four more days, and the owner wants that quota spent.
- Proposal: a refusal mark holds for `dryMarkMinutes` (60 minutes), not for the stated reset, so the next start probes again. A refused call costs a failed process and no tokens (issue 021, Impact); a blocked model that works costs quota that is never spent. The stated reset could stay in the mark as information.

## Environment

Claude Code 2.1.303, Aether plugin 0.12.2 installed, Sonnet 5.5 as the Lead, agy 1.4.2, Linux (WSL2).
