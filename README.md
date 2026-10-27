# Cadence: ICMP Timing Analysis

An interactive teaching lab and defensive case file for ICMP covert timing channels. A sender hides bits in the pauses between ping requests. A detective examines receiver-side timing. A guardian tests detection rules and a paced-relay model. The final scene locks a note with real browser AES-GCM and shows how content secrecy differs from timing detection.

## Run locally

```powershell
cd ui
npm ci
npm run dev
```

Open the local address printed by Vite. `Ctrl+C` stops the server. The app runs in the browser and does not transmit ICMP packets.

## The visitor's path

1. **The idea:** type a short note and see its UTF-8 bits and short/long packet pauses.
2. **Detective:** compare prepared normal and covert recordings, change network variation and channel subtlety, then make a guess before revealing the labelled answer.
3. **Guardian:** compare a fixed rule, a locally trained baseline, and a clean-only baseline. Read detection and false alarms together. Try a causal paced-release model and see both bit recovery and added normal-ping delay.
4. **Locked note:** encrypt in the browser with AES-256-GCM using a PBKDF2-derived key. Model timing delivery, run a guardian on the encrypted timing, and attempt decryption with the correct or wrong key. The displayed transmission time is an estimate at approximately one bit per second; no packets are sent.
5. **Case closed:** summarize what the model demonstrates and what still needs real measurements.

The original **Runs**, **Signal**, **Detectors**, **Stress matrix**, and **Decode** tools are directly accessible in the top navigation. They retain the recording table, CSV import, timeline, distributions, detector controls, ROC/PR and feature comparisons, stress grid, decoder, exports, and packet-field checks. The footer's **Analysis overview** explains the tools. **Guide** translates terms, units, controls, and charts. **Evidence** separates software, simulation, and real-network claims.

## Data and honesty

- The included bundle contains 610 **simulated** runs and **zero real receiver captures**. The guided detective and guardian scenes calculate from those runs using the original detector functions.
- The paced relay and locked-note transmission are **browser models**. The relay has not been deployed on a router. Browser encryption is real, but the ping timing delivery is simulated.
- A CSV without an explicit `simulated=1` marker starts **Unverified**. Check its manifest and set its source on Recordings before citing it as a real capture. A filename does not prove origin.
- The original Python capture, sender, field-check, and export pipeline remains in `icmp_detector/` and `scripts/lab/`. The lab runbook is `scripts/lab/README.md`.
- The Evidence page uses the ten objective descriptions and status assessments recorded in the Review 3 work. Its references and limits are available there too.
- The narrower 250-run Review 3 study is preserved at `ui/public/data/review3.bundle.json`; the 610-run default includes the subtle-channel conditions used by the guided case.

## How it is built

- `ui/src/views/CaseView.tsx`: guided case and SVG timing comparison.
- `ui/src/lib/case/experiment.ts`: case selection, detector rates, and paced-release model.
- `ui/src/lib/case/crypto.ts`: browser AES-GCM and reproducible timing simulation for the locked note.
- `ui/src/views/LabView.tsx`, `GuideView.tsx`, `EvidenceView.tsx`: plain-language tool map, searchable explanations, and evidence record.
- `ui/src/views/{Runs,Signal,Detectors,Stress,Decode}View.tsx`: full original analysis tools.
- `ui/src/lib/analysis/`: TypeScript analysis checked against the Python implementation's golden fixtures.
- `ui/public/data/bundle.json`: 610-run simulated example data exported by Python and validated before the views use it.
- `ui/public/data/review3.bundle.json`: frozen 250-run Review 3 study, available from Evidence for comparison.

## Checks

From `ui/`:

```powershell
npm run typecheck
npm run test
npm run build
$env:CHROMIUM_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npx playwright test e2e/v2.spec.ts
```

The original project's README is preserved at `docs-v2/BASELINE_README.md`, and the later Review 3 version is at `docs-v2/REVIEW3_README.md`. The three-person final-review run sheet, individual speaker cards, cue card, and question bank are in `docs-v2/final-review/`; ready-to-share PDFs are in its `handouts/` folder. The earlier short solo demonstration remains at `docs-v2/DEMO_SCRIPT.md`.
