# Design: the text a session is launched with does not record the owner's authorizations

- **Feature:** `specs/034-headless-grants`
- **Author:** the Lead (Fable 5.2), 2026-11-11.
- **Route:** short design. It changes who may record an authorization for an irreversible action, so it touches security and authorization.
- **Scope:** `aether-autonomy grant`, `trust` and `brake-off`, and how `check` reads a stored grant. `start`, `revoke` and `aether-delegate authorize` keep today's behaviour.

## The owner's words

Session of 2026-11-11. The owner asked the Lead to analyse issue #1 again («quiero que lo incluyas a tuy trabajo analiza el issue 1. d enuevo ya esta cerrdado»). Reading how the owner's words are verified for that analysis, the Lead found the gap below, proposed to close it before anything else of issue #1, and recommended reporting it in private until it is fixed. The owner answered «si a todo lo que ncesitas y lo que necesitas para continaur sacalo tu» and then approved the run's plan, whose third assumption reads: «Una sesión sin terminal ya no puede registrar permisos, confiar en un autor de skills ni apagar el freno de cuota con el texto con que se lanzó. Abrir una corrida y colocar un delegado en un modelo siguen como hoy. Consecuencia: si tú mismo lanzas una sesión con `claude -p`, el permiso para fusionar o publicar se registra antes, en una sesión normal.»

## What happens today, read against 0.38.0 (`42c792f`)

- `verifyQuote` in `plugins/aether/lib/autonomy.js` checks a quote against the owner's messages of the session, which `ownerMessages` in `plugins/aether/lib/voice.js` takes from the session's transcript: a record of type `user` that is not a tool result, a summary or a subagent's, and whose `origin`, when it has one, is `human`.
- A session without a terminal (`claude -p`) has such a record too: the text it was launched with. Whoever started the process wrote that text: the owner at a shell, a script, or another agent. The transcript does not say which.
- `grant`, `trust` and `brake-off` accept a quote from that record like any other, and a grant of scope `repo` then covers every session of the repository (`check`, `lib/autonomy.js`). So the words that authorize an irreversible action need not have been typed by the owner.
- The record of a launch text can be told apart. In the transcripts of this project (73 conversations, read on 2026-11-11 for these two fields only, never their text) every record of a session with a terminal has `entrypoint: "cli"`, and the launch text of each of the two sessions without one has `entrypoint: "sdk-cli"` and no `origin`. `start` already relies on that field: `isHeadlessTranscript` (`lib/autonomy.js`, about line 76) lets a session without a terminal open a run without a plan approval. A prompt that the plugin itself submits has `origin: "plugin"` and is already not an owner message.

## Criteria

- **C1** A quote that is found only in a record whose `entrypoint` is `sdk-cli` does not verify for `aether-autonomy grant`, `trust` or `brake-off`. The command refuses, writes nothing, and says why and where to record it: in a session with a terminal.
- **C2** In a session with a terminal the three commands work as today.
- **C3** A grant already in the registry whose quote is found only in such a record no longer covers anything: `check` skips it, and `aether-autonomy list` shows it with a status that says why.
- **C4** `start`, `revoke` and `aether-delegate authorize` verify a quote as today, launch text included: a session without a terminal still opens a run and places a delegate on a model, and may still withdraw a grant.
- **C5** `npm test` and `npm run test:mod` pass. The tests that record a grant, a trusted author or a brake-off from a launch text are moved to a typed message, and only those.

## Design

**D1. A message knows whether it is launch text.** `ownerMessages` in `lib/voice.js` returns, with each message, `launched: true` when its record's `entrypoint` is the string `sdk-cli`, and `false` otherwise: a record with another entrypoint, or with none, is treated as today. The rule is by record, not by transcript, so a session that was launched without a terminal and later continued in one keeps its typed messages. What `aether-voice` prints does not change.

**D2. Three commands ask for typed words.** `verifyQuote` takes an option `typedOnly`. With it, the quote is searched only in the messages that are not `launched`. `grant` (`grant` in `lib/autonomy.js`), `trust` (`trustAuthor`, when it adds an author) and `brake-off` (`brakeOff`) pass it; `start`, `revoke`, `delegate-authorize` and `trust` when it removes an author do not: withdrawing an authorization is never refused for where the words came from. When the quote is in a launched message and in no typed one, the refusal's reason is: `this quote is in the text the session was launched with, which is not the owner typing: record it in a session with a terminal`. The other refusals keep their words.

**D3. A stored grant is read by the same rule.** The reader that `check` and `list` use to re-verify a stored grant against its session's transcript passes `typedOnly` too. A grant whose quote is only in launch text gets the status `launch-text`; `check` skips it as it skips `invalid`. A grant whose transcript is gone is still returned, as today: nothing can be said of it.

**D4. Records.** `docs/guide/autonomy.md` says that an authorization is recorded only from words typed in a session with a terminal, and what a session without one may still do. The changelog entry says the same and names no way to misuse an older version. The Lead's rules get one sentence, in «Recording the owner's authorizations» of `skills/using-aether/SKILL.md`: «In a session without a terminal no authorization can be recorded: put the action in the owner's list.» If that sentence takes a part of the bootstrap over 9,800 characters, it is left out and the Lead learns it from the refusal's message; no other rule is shortened to make room.

## Accepted limits

- A process that can type into the owner's terminal, or write a transcript file, is the owner for this check. The check keeps a session from being launched with words that then count as his; it is not a defence against a process that already acts as him.
- Opening a run and placing a delegate from launch text stay possible. They authorize reversible work and its cost; every irreversible action inside such a run still needs a grant, which now cannot come from that text.
- The owner's own scripts that launch a session without a terminal can no longer record a grant inside it. He records it first in a session with a terminal, with scope `repo`; the launched session's `check` then finds it.
- The field `entrypoint` is Claude Code's. If a later version names the launch differently, the rule stops matching and a launch text would count again; the test of D1 pins the value read from real transcripts, and the design says where it was read.
- Only two transcripts of sessions without a terminal were available to read the field from.

## Tests

In the style of `tests/autonomy.test.js` and `tests/aether-autonomy.test.js`, whose helper `human()` writes a transcript line with a chosen `entrypoint`. Written first and seen failing.

1. A transcript whose only owner message is launch text (`entrypoint: "sdk-cli"`, with `origin: { kind: "human" }` and also with no `origin`, as the real records are): `grant`, `trust` and `brake-off` refuse with the reason of D2, and the registry file is not written.
2. The same quote in a typed message (`entrypoint: "cli"`): the three succeed as today. A record with no `entrypoint` and one with an unknown entrypoint: as today.
3. A transcript with the quote in launch text and, later, a typed message that does not hold it: refused. With a typed message that holds it: accepted, and the grant's time is the typed message's.
4. `start`, `revoke` and `delegate-authorize` with a quote that is only in launch text: accepted, as today.
5. A registry that holds a `repo` grant whose quote is only in launch text: `check` does not cover its class, from the same session and from another session of the repository, and `list` shows the status `launch-text`. The same registry with its transcript removed: the grant is returned, as today.
6. `tests/voice.test.js`, or the file that tests `ownerMessages`: `launched` is true for an `sdk-cli` record and false for the others, and the text and time of each message are unchanged.
7. The existing tests of `grant`, `trust` and `brake-off` whose transcripts are written with `sdk-cli` are moved to `cli`; the tests of `start` without a terminal keep `sdk-cli`.
