# Muse refuses the schemas of the seats and of the swarm, so every round it takes falls to Claude

**Type:** bug (Muse adapter)
**Date:** 2026-10-21
**Found in:** the design run `wf_d46ae949-355` of spec 010 and the swarm run `20261021-005105-e2cc`, in the Lead's session 7c77db6f
**Status:** fixed in 0.14.5 (2026-10-21), branch `fix/external-seats`, decision [A70](../decisions.md): the adapter writes a strict copy of the schema
**GitHub:** none yet. This file is the local record.

## What happened

Muse was picked for seven calls (three Judge rounds, one implementer, two supervisors and the final review) and failed every time with `muse failed: API error 400: 'additionalProperties' is required to be supplied and to be false.` Each one then ran on the native agent: three Opus Judge rounds, a Sonnet supervisor twice, a Sonnet implementer and the Opus final review. The smoke call of 0.13.0 had passed because its schema is strict.

## Cause

Muse's provider takes a structured-output schema only in strict form: every object schema says `additionalProperties: false` and lists every key of its properties under `required`. The role schemas of `lib/lane-schemas.js` close no object, and the Writer's three have optional keys.

## Fix and evidence

`strictSchema` (`lib/lane-schemas.js`) returns a copy with both rules, and the Muse adapter's `argv` rewrites the call's own schema file with it. Real calls on 2026-10-21 (paid-call, granted by the owner): the Judge schema with only `additionalProperties` closed answered clean; the three Writer schemas still failed with `'required' is required to be supplied and to be an array including every key in properties`; with both rules all eight role schemas answered clean on Muse.

## Impact

Muse, one of the three harnesses the owner wants first, could not take any round with a schema, and each failure cost a native Claude round.
