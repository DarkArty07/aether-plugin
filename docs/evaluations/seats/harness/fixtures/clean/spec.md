# slugify

- Date: 2026-10-13
- Status: Draft
- Intent: a function `slugify(text)` for URLs.

## Criteria

- C1: `slugify("Hello,  World!")` is `"hello-world"`. Evidence: a test checks it.
- C2: Leading and trailing punctuation leave no dash: `slugify("--Hi--")` is `"hi"`. Evidence: a test checks it.
- C3: An empty or all-punctuation input gives `""`. Evidence: a test checks `slugify("")` and `slugify("!!")`.

## User scenarios

1. Given the title "Hello,  World!", when the site builds its URL, then the path ends in `/hello-world`.

## Requirements

- R1. `src/slugify.js` exports `slugify(text: string) -> string`. Serves: C1, C2, C3
- R2. It lowercases, then turns each run of characters other than `a-z` and `0-9` into one `-`, then trims `-` at both ends. Serves: C1, C2, C3

## Proposals

None.

## Assumptions

1. Letters outside a-z, such as "é", count as punctuation. Basis: the owner asked for URLs. The owner can reverse it.

## Irreversible actions

None.

## Out of scope

- Transliteration of accented letters.
