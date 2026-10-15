# Revoking a one-time grant removes every grant of its class, including standing ones and other sessions'

**Type:** bug (autonomy, grant registry)
**Date:** 2026-10-15
**Found in:** closing the 0.11.0 release, in the Lead's session 777d41c2
**Status:** open
**GitHub:** [#22](https://github.com/DarkArty07/aether-plugin/issues/22) (private repository)

## Summary

`aether-autonomy revoke --class <class>` removes every grant of that class, whatever its scope, session or quote (`lib/autonomy.js:157`, `registry.grants.filter((g) => g.class !== cls)`). The bootstrap's procedure for a one-time action under `AETHER_IRREVERSIBLE=enforce` is to record the owner's reply as a session grant, run the action, and then revoke it (`using-aether` SKILL.md:216, `autonomous-runs` SKILL.md:78). That routine revoke also removes grants the owner gave for other purposes.

## What happened

- aether-guard refused `git push` because no grant covered it.
- Following the bootstrap, the Lead recorded the owner's reply («ya cierra todo lo pendiente que quiero comenzar a usar la neuva version») as session grants for `push`, `merge-main` and `delete`. Then it pushed, merged PR #21 and tagged.
- `aether-autonomy revoke --class merge-main --quote "<the same words>"` answered `"removed": 2`. The second grant it removed was from session 7081714f (2026-10-09): «apruebo merge a main en esta ocasion y en todas las futuras ocasiones en esta sesion», with scope `session`.

## Impact

- Here, none: session 7081714f ended on 2026-10-09.
- A repository-scope grant that the owner gave in general words («todos los merges a main») would be removed the same way. It would take only the Lead's routine revoke after a one-time action, with no word from the owner, and the next merge would wait for the owner again.

## Proposals

1. `revoke` removes only the grants that match the class and the session by default. Removing every grant of the class takes `--all`, for the owner's words that withdraw a class.
2. Or `grant` returns an id, and the one-time procedure revokes by that id.
3. The bootstrap's one-time procedure names the narrow form.

## Acceptance

- After a one-time session grant is recorded and revoked, these stay:
  - a repository-scope grant of the same class;
  - another session's grant of the same class.
- The owner's words that withdraw a class still remove every grant of that class.

## Environment

Aether 0.10.0's bins in the session that released 0.11.0. The code is the same in 0.11.0. Linux (WSL2).
