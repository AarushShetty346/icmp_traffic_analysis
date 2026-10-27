# Cadence — 15-minute, three-person review

**Order:** You → Harsh → Aarush. **One laptop, one browser session.** Each person speaks for roughly five minutes and leaves the next person's chapter open.

## The single story

> A sender hides 0s and 1s in the pauses between ordinary ping requests. We first inspect those pauses, then test whether a defender can spot or disrupt the message without harming normal traffic. Finally, we encrypt the note and ask what the defender can still learn. The site makes those ideas visible and gives us a workbench to test them; the included network runs are simulated.

Keep coming back to **three questions**: Can the receiver read the bits? Can the guardian notice the timing? What does the defence cost ordinary traffic?

## The run of show

| Clock | Speaker | Live route and purpose | Leave the laptop here |
| --- | --- | --- | --- |
| 0:00–5:00 | You | Guided case chapters 1–2, **Runs**, **Signal**. Explain how bits become waits, show where recordings come from, then investigate a suspicious trace. | Guided case, **Guardian** chapter open. |
| 5:00–10:00 | Harsh | Guided case **Guardian**, then **Detectors** and **Stress matrix**. Compare detection with false alarms; show the pacing trade-off and wider results grid. | Guided case, **Locked note** chapter open. |
| 10:00–15:00 | Aarush | Guided case **Locked note**, **Decode**, **Guide**, **Case closed**, **Evidence**. Demonstrate real browser encryption, decoding, limits, architecture, and the next experiment. | Evidence page and final claim visible. |

This touches every main function on the top navigation. The **Analysis overview** in the footer is a map of the five workbench tools; mention it if someone asks where to begin, but it needs no separate live stop.

## Exact handoffs

1. **You → Harsh:** Click **Continue: Guardian**. Say: “We can see a suspicious timing pattern. Harsh will show whether a rule can detect it reliably, and what happens to ordinary traffic.” Hand him the laptop.
2. **Harsh → Aarush:** Return to **Guided case**, open **Locked note** in the chapter bar. Say: “A guardian can see timing and can even disrupt it. Aarush will show what changes when the note itself is encrypted.” Hand him the laptop.
3. **Aarush → panel:** Finish on **Evidence**. Say: “Our software and browser encryption work, and the simulations show the trade-offs. The next claim needs real receiver-side captures; the page states that limit openly.”

## Keep these claims precise

- **610 included runs are simulated; zero included receiver captures are real.** The CSV importer accepts a user's capture, but importing a file does not prove how it was collected.
- The guided case computes from the included dataset. A high detection percentage is a result for a **small controlled set of windows**, not a universal accuracy guarantee.
- The paced relay is a **causal browser model** that holds packets; it has not been deployed on a router.
- AES-256-GCM encryption is performed by the browser's Web Crypto API. The encrypted bytes' **timing delivery is simulated**, with no ICMP packets sent by that scene.
- Our contribution is the integrated investigation and evaluation workflow: sender idea → receiver evidence → detector errors → defence cost → encrypted content → evidence limits. We are not claiming to have invented AES or covert timing channels.

## Five-minute preflight on the review laptop

1. Keep both `C:\Users\adita\Desktop\CADENCE-V2` and the original `CNPROJECT` folder present: the local copy shares installed UI dependencies with the original to save disk space.
2. Open <http://127.0.0.1:5174/#/case>. If it does not load, open PowerShell and run:

   ```powershell
   cd C:\Users\adita\Desktop\CADENCE-V2\ui
   npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
   ```

   Leave that PowerShell window open. Do not open `index.html` directly as a file.
3. Confirm the banner says the included recordings are simulated, and the first page says **610 simulated recordings** after loading.
4. Check that **Guardian** opens and **Locked note → Lock this note** succeeds. Reload the start URL afterward.
5. Keep this run sheet and the three speaker cards open on a phone or printed. Leave the laptop browser for the demo itself. Use a visible timer; rehearse the *clicks* as well as the words.

## Recovery links if the browser lands on the wrong page

- [Start / idea](http://127.0.0.1:5174/#/case)
- [Detective](http://127.0.0.1:5174/#/case?step=1)
- [Guardian](http://127.0.0.1:5174/#/case?step=2)
- [Locked note](http://127.0.0.1:5174/#/case?step=3)
- [Case closed](http://127.0.0.1:5174/#/case?step=4)
- [Evidence](http://127.0.0.1:5174/#/evidence)

The top navigation reaches Runs, Signal, Detectors, Stress matrix, Decode, Guide, and Evidence. If a click or animation is slow, **say the point while it loads**. Skip an optional control before stealing time from the next presenter.

## What to rehearse together

Run the whole sequence twice. The first pass is slow, with questions; the second pass uses a timer and the same laptop. Each person must practice **arriving at their starting screen**, speaking their first line, making their clicks, and delivering their handoff. Do a third pass only for the part that ran over time. Read [common questions](QUESTIONS_AND_ARCHITECTURE.md) once as a team.

Speaker cards: [You](01_YOU.md) · [Harsh](02_HARSH.md) · [Aarush](03_AARUSH.md).
