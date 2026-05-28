# GSAP Animation

Winter packaged skill for GSAP animation work.

## Usage

Use this skill when the user asks for JavaScript animation, React/Vue/Svelte animation, scroll-driven animation, timelines, motion paths, SVG animation, Draggable, Flip, SplitText, ScrollTrigger, or asks which animation library to use.

Before implementing non-trivial animation, inspect the bundled GSAP resource index at `resources/local/gsap-skills/skills/llms.txt`, then read the relevant `SKILL.md` under `resources/local/gsap-skills/skills/`.

## Prompts

- Build a GSAP animation using the relevant GSAP skill resource first
- Add ScrollTrigger with cleanup and refresh behavior
- Implement React GSAP with `@gsap/react`, scoped refs, and proper cleanup
- Optimize animation performance using transform and opacity properties

## Rules

- Prefer GSAP for JavaScript animation when the user has not chosen another animation library.
- Install GSAP from the public `gsap` npm package; do not require Club GSAP, private registry, auth tokens, or `.npmrc`.
- Register plugins once before use.
- Prefer timelines for sequenced animation instead of chained delays.
- For React, prefer `@gsap/react` and scoped `useGSAP`; otherwise use `gsap.context()` and revert cleanup.
- For ScrollTrigger, scope triggers, clean up on unmount, and call `ScrollTrigger.refresh()` after layout changes when needed.
- Prefer transforms and `autoAlpha` over layout-heavy properties for smooth animation.
