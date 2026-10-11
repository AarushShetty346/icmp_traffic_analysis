# Cadence: decisions

Checked live against the npm registry on 2026-10-10 (`npm view <pkg> version license time.modified deprecated`).
**GitHub star counts are not recorded:** this environment can only reach the project repository on GitHub,
so stars could not be verified and are left out rather than guessed.

## Adopted

| Package | Version | Licence | Last published | Why |
|---|---|---|---|---|
| vite | 8.3.4 | MIT | 2026-10-08 | Static build, relative base path for GitHub Pages, Web Worker bundling |
| react / react-dom | 19.3.0 | MIT | 2026-10-08 | Component model; no SSR needed |
| typescript | 5.9.3 | Apache-2.0 | | Types for the analysis port and the bundle schema |
| tailwindcss (+ @tailwindcss/vite) | 4.3.3 | MIT | 2026-10-09 | Utility layer over our own CSS-variable tokens (v4 is configured in CSS, so there is no `tailwind.config.js`; tokens live in `ui/src/styles/index.css`) |
| @radix-ui/react-dialog, -popover, -slider, -switch, -toggle-group | 1.x | MIT | 2026-10-09 | Accessible unstyled primitives; the two-thumb slider gives a keyboard-accessible range brush |
| @heroicons/react | 2.2.0 | MIT | 2026-05-12 | Icons |
| d3-scale, d3-shape | 4.0.2, 3.2.0 | ISC | 2023-04-12 | Scales and line generators; charts are hand-written SVG. Stable, not abandoned: the API is complete |
| zod | 4.6.5 | MIT | 2026-10-02 | Validates the exported bundle before any view sees it (mirror of `icmp_detector/schema/bundle.schema.json`) |
| @fontsource-variable/ibm-plex-sans, @fontsource/ibm-plex-mono | 5.3.0 | OFL-1.1 | 2026-07-19 | Self-hosted fonts |
| storybook, @storybook/react-vite | 10.6.1 | MIT | 2026-10-09 | Component states (`npm run storybook`) |
| @playwright/test | 1.64.0 | Apache-2.0 | 2026-10-10 | End-to-end and manifest-driven control tests |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | 2026-10-09 | Accessibility checks in e2e |
| vitest, jsdom, @testing-library/react | 5.0.3 / 29 / 16 | MIT | 2026-09-30 | Unit and parity tests |

Chart layer: D3 modules rather than Recharts. The charts need things Recharts does not give cheaply
(window-boundary overlays, lost-packet markers, ECDF steps, a narrow-screen transposed heatmap, PNG export
with a provenance footer), and two d3 modules cost about 10 KB gzipped.

Removed after first use: `@radix-ui/react-tooltip` and `@radix-ui/react-tabs` (every explanation is a
popover button that also works by touch; navigation is links), `d3-array` (unused).

## Reference only

| Package | Version | Licence | Use |
|---|---|---|---|
| @uswds/uswds | 3.14.0 | "SEE LICENSE IN LICENSE.md" (not an SPDX id on npm) | Pattern study: form labelling, error summaries |
| @primer/react | 38.40.1 | MIT | Pattern study: data tables, dense layouts |
| react-aria | 3.53.1 | Apache-2.0 | Not needed: Radix's slider already covers the keyboard-accessible range brush |

## Do not use

| Package | Version / state | Reason |
|---|---|---|
| Next.js (`next`) | 16.4.0, maintained | No server rendering or routing server needed; a static Vite build is simpler for GitHub Pages |
| MUI (`@mui/material`) | 9.5.0 | Heavy, and its default look conflicts with a distinct identity |
| Ant Design (`antd`) | 6.6.5 | Same: heavy, strongly opinionated look |
| Chakra UI (`@chakra-ui/react`) | 3.37.0 | Second styling system next to Tailwind |
| Bootstrap | 5.3.8 | Generic look; global CSS conflicts with tokens |
| Bulma | 1.0.4, last published 2025-04 | Generic look; CSS-only, no accessible behaviour |
| Foundation (`foundation-sites`) | 6.9.0, last published 2024-09 | Generic look, slow release cadence |
| UIkit | 3.25.26 | Generic look; jQuery-era component model |
| Semantic UI (`semantic-ui-css`) | 2.5.0, last published 2022-10 | Stale (four years without a release) |
| Flowbite / DaisyUI | 4.0.2 / 5.7.47 | A second utility/component layer on Tailwind; Tailwind plus Radix is enough |
| Create React App | 5.1.0 on npm | The React team announced its deprecation in February 2025 (from memory; not re-verified live here). npm does not flag the package deprecated |
| Reach UI (`@reach/dialog`, `@reach/router`) | 0.18.0 / 1.3.4 | Superseded (Reach Router merged into React Router; Reach UI unmaintained). Not re-verified live beyond npm metadata |
| Astro / 11ty | 7.3.8 / 3.1.6 | Content-site generators; this is an interactive app, not docs-only |
| Animation and 3D stacks of the old site | n/a | Removed in Phase 2; motion here is CSS only |

## Skills

The brief named ten skills (Frontend Design, Color System Builder, Theme Factory, Typography Scale
Builder, Design System Builder, UI Component Generator, Storybook Generator, Animation Library / Motion
Design System, Responsive Design Helper / Tester, Accessibility Checker, Site Audit). **None of them is
available in this environment** (ListSkills / SearchSkills returned no match). The one relevant skill that
does exist, **dataviz**, was used: its palette validator checked the normal/covert series colours and the
sequential ramp, and its mark and interaction rules shaped the charts (legends for two or more series, a
table view for every chart, 2 px lines, hover tooltips, single-hue sequential ramp, no dual axes).

Each missing skill's procedure was followed by hand:

| Skill in the brief | Done instead |
|---|---|
| Frontend Design | `DESIGN_BRIEF.md` written first |
| Color System Builder, Theme Factory | `ui/scripts/palette.mjs`: OKLCH 50–950 scales, semantic tokens, contrast checks (all pass, AAA for body text) |
| Typography Scale Builder | Fluid `clamp()` scale in `index.css`; IBM Plex Sans + Mono |
| Design System Builder, UI Component Generator, Storybook Generator | `ui/src/components/ui` primitives, `ui/src/stories` (default, disabled, loading, error, empty, light/dark toolbar) |
| Animation Library, Motion Design System | Motion tokens in `index.css`, reduced-motion respected |
| Responsive Design Helper / Tester, Accessibility Checker, Site Audit | Playwright overflow checks at six widths, axe on every route, Lighthouse, console-error checks (`QA_REPORT.md`) |

## Other decisions

- **Hash routing** (`#/route?params`) so GitHub Pages needs no 404 rewrite and every view state is a link.
- **Relative base** (`./`) so the same build works under `/<repo>/` on Pages and from a local folder.
- **CSV parsing in a Web Worker**; files never leave the browser.
- **The method is unchanged.** The browser port reproduces `features.py`, `detector.py`,
  `experiment.build_baseline`, `evaluation.roc_curve` and `metrics.decode_bits`, and is checked against
  Python-generated golden fixtures to 1e-9 (`ui/src/lib/analysis/parity.test.ts`). Defaults (window 32,
  p95, 0.1 s fixed limits, std feature) match the Python CLI.
