# Cadence: design brief

**What it is.** A workbench for reading timing in ICMP Echo Request flows. People use it at a lab bench and
in a review room: load runs, look at gaps, move detector settings, see what breaks under jitter and loss,
and export evidence. It is not a landing page; nothing animates for its own sake.

**Who reads it.** Three students preparing a live demo, and examiners who will ask "is this number real?".
Every screen must answer that question without being asked: a provenance banner under the header, a badge
on every panel, tile and export.

**Name.** *Cadence*: the rhythm of a stream of requests is exactly what the channel modulates. The formal
project title appears only in Evidence → About.

## Direction

- **Instrument, not poster.** Dense but calm: a light warm-grey page, white panels with a 1 px line, one
  teal accent for selection and primary actions. Colour is reserved for data and for state.
- **Data first.** Charts take the full panel width; controls sit above the chart they drive, in one row on
  desktop and stacked on phones. Numbers use a monospace face with tabular figures so columns line up.
- **Plain language next to every statistic.** Each feature name has an info button (a real button, so it
  works by touch and keyboard) explaining it in one or two sentences with its unit.
- **Provenance is part of the identity.** SIMULATED is an amber "beaker" badge, REAL CAPTURE a teal
  "signal" badge; both carry text and an icon, never colour alone.

## Tokens

- **Colour.** One brand hue (teal, OKLCH hue 205) generated to a 50–950 scale, a neutral warm grey, and
  an amber scale for SIMULATED (`ui/scripts/palette.mjs`). Semantic tokens (`--bg`, `--surface`,
  `--ink`, `--ink-2`, `--ink-3`, `--line`, `--accent`, `--sim-*`, `--real-*`, `--flag`) are CSS variables;
  Tailwind v4 reads them through `@theme inline` in `ui/src/styles/index.css`. Dark mode is chosen per
  token, not inverted. Contrast is computed by the script: body text ≥ 7:1 (AAA) and all other text ≥ 4.5:1
  in both themes.
- **Data colours.** Normal traffic blue, covert orange (validated with the dataviz skill's palette checker
  for colour-vision deficiency separation); a single-hue 8-step sequential blue ramp for the stress
  matrix, with the cell label ink chosen per step. Flags (suspicious windows, wrong bits, lost requests)
  use a red reserved for that meaning.
- **Type.** IBM Plex Sans (variable) for text, IBM Plex Mono for numbers, IDs and code. Chosen for its
  engineering character and its matching mono; self-hosted via Fontsource, so nothing loads from a third
  party at run time. A fluid `clamp()` scale from 12 to 51 px with set line heights.
- **Space and shape.** 4 px grid; 6–8 px radii; 44 px minimum height for every control.
- **Motion.** Three durations (120/200/320 ms) and two easings, used only for state changes (switch thumb,
  hover colour, skeleton shimmer). `prefers-reduced-motion` removes all of it.

## Information architecture

Runs → Signal → Detectors → Stress matrix → Decode → Evidence, as top-level tabs (a 3×2 grid on phones).
Every view keeps its state in the URL hash (`#/detectors?cond=jitter%2050%20ms&w=16`), so any screen is a
link. Ctrl/Cmd-K opens a command palette for navigation, theme, adding CSV files and exports.

## States

Each view has a loading skeleton, an empty state that says what to do next, and an error state with a
retry. Charts render server-free from the bundle; heavy views are code-split and load on first visit.

## Print

Printing (or "Save as PDF") hides navigation and buttons, keeps the provenance banner, and avoids splitting
panels across pages.
