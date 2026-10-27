# Cadence: five-minute final-review demonstration

For the three-person, 15-minute review, use [the team run sheet](final-review/START_HERE.md) and its individual presenter cards. This page is a shorter solo fallback.

Open `http://127.0.0.1:5174/`. Use the included simulated case first. Every scene says where its numbers come from.

**0:00 — The idea.** “Ping requests normally arrive about one second apart. A sender can use a short wait for 0 and a long wait for 1. Type HI; these 16 bits could become 16 timing gaps. Our question is whether a defender can spot or disrupt such a message without disturbing normal traffic.”

**0:45 — Detective.** Click *Start the investigation*. Keep the subtle 0.95/1.05-second channel and 50 ms of delay variation. Compare the blue normal reference with the orange case. Point to the three measurements under the graph: average pause, typical variation, and full range. Guess *A hidden message* and reveal the answer. “This is a labelled simulated recording. Real traffic would not arrive with a truth label.”

**1:40 — Guardian.** Click *Continue: Guardian*. Read “Messages caught” and “False alarms” together, then show the red alarm squares for ordinary and message-carrying traffic. Switch among Fixed limit, Same conditions, and Clean-only baseline. “The learned normal reference depends on the network condition; a rule can raise many alarms on ordinary traffic when conditions change.” Move the initial waiting-room slider. “The paced relay can make bits harder to read, but it delays normal pings. It is a model, not yet a router implementation.”

**3:00 — Locked note.** Click *Continue: Locked note*, then *Lock this note*. “AES-GCM is real browser encryption. HI becomes a much larger locked package: about six minutes at this channel's roughly one bit per second.” Point to the guardian timing result and the receiver's successful unlock. Click *Try a wrong key*; it fails. Restore the key, then select 50 ms of delay variation; damaged bits cause the authenticated unlock to fail. “Content secrecy, message delivery, and timing detection are separate questions.”

**4:15 — Evidence.** Click *Continue: Case closed*, then *Inspect evidence and limits*. “The shipped data is simulated. The next scientific step is repeated receiver-side captures of normal and covert lab traffic, including delay variation, with separate baseline and test runs. We will compare detection, false alarms, bit recovery, and legitimate-traffic cost.”

If asked for technical detail, use the **Runs**, **Signal**, **Detectors**, **Stress matrix**, and **Decode** tabs. The footer's **Analysis overview** explains what each tool does. If asked what a term means, open **Guide** and search it. Avoid treating simulated results as measured network performance.
