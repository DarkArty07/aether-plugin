---
name: art-direction
description: "Use when specifying a visual feature (such as an interface, a page, or a graphic element) to define the art direction before drafting the plan."
---

## User Input

```text
$ARGUMENTS
```

## Outline

When specifying a visual feature (an interface, a web page, a visual component, or a graphic element), write `specs/NNN-<topic>/art-direction.md` before drafting `plan.md`. The plan reads this file when it exists to guide visual and layout decisions.

Never stop to ask. Where a choice is open, pick a coherent aesthetic and visual system that fits the product and record reasonable defaults.

Write `specs/NNN-<topic>/art-direction.md` covering:

1. **Visual intent:** The overall feel, aesthetic posture, personality, and emotional resonance.
2. **Palette:** Color tokens, semantic roles (background, surface, borders, primary, accent, text hierarchy, status colors), and contrast rules.
3. **Typography:** Font families, type scales, font weights, line heights, and typographic hierarchy.
4. **Spacing and composition:** Layout grid, spatial rhythm, margins, gutters, padding scale, and container constraints.
5. **Motion:** Purpose of animation, timing functions, durations, transitions, and reduced-motion support.
6. **States:** Visual treatments for interactive states: default, hover, active, focus, disabled, loading, empty, and error states.
7. **Anti-patterns (things not to do):** Explicit list of styling choices, decorative elements, animations, or visual clutter to avoid.

The Writer finishes and commits `specs/NNN-<topic>/art-direction.md` before `plan.md`, and the plan incorporates its direction.
