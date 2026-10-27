# Team question bank and architecture card

Read this together once. In the review, answer in **one plain sentence first**, then add detail only if the reviewer asks. If a question belongs to another segment, let that presenter answer it.

## The system in one picture

```text
Python simulator ──> versioned JSON example bundle ──> browser UI
Lab sender/capture scripts ──> receiver CSV import ─────> browser UI
                                                   │
                                                   ├─ gap and window measurements
                                                   ├─ fixed and learned detector rules
                                                   ├─ charts, tables, reports, and exports
                                                   └─ bit decoder

Browser Web Crypto ──> encrypted bytes ──> timing model ──> receiver unlock attempt
                                        └─> guardian timing check
```

The interface is React/TypeScript. The guided scenes reuse the analysis functions behind the detailed workbench. Data is fetched as a versioned JSON bundle and validated in the browser. CSV parsing runs in a browser worker. The browser uses Web Crypto for AES-256-GCM. Python also contains the simulator, detector reference implementation, tests, and the closed-lab send/capture scripts. The current guided demo does not send network packets.

## Core questions

| Reviewer asks | Short answer | Best speaker |
| --- | --- | --- |
| What is ICMP? | The protocol used by ping; we examine the arrival times of its Echo Requests. | You |
| What is a covert timing channel? | A sender encodes information in *when* otherwise ordinary packets arrive, rather than in their visible contents. | You |
| How does zero or one get sent? | A short planned gap means 0, a long planned gap means 1; the receiver compares each received gap with a dividing line. | You / Aarush |
| Are you changing packet payloads? | The timing-channel idea changes gaps; packet-field equivalence still needs real lab captures and field checks to verify. | You |
| Why receiver-side timestamps? | The receiver observes the timing after network delay and loss have acted on it. | You |
| What is jitter? | Variation in network delay from packet to packet; it can blur the short/long difference. | You |
| What does “ms” mean? | Millisecond: one-thousandth of a second. The subtle demo gaps are 950 and 1050 ms. | You |
| Why compare a normal reference? | Without ordinary traffic under comparable conditions, an unusual-looking gap has no useful context. | You / Harsh |
| What is a window? | One group of consecutive requests judged together; the guided case uses 32 requests, giving up to 31 gaps. | Harsh |
| What is standard deviation? | A measure of how much the gaps wobble around their average. | Harsh |
| How is the learned baseline made? | From separate ordinary runs, it learns a 95th-percentile limit for the chosen feature; the guided case tests standard deviation. | Harsh |
| What is the fixed rule? | In the guided case it alarms if standard deviation exceeds 100 ms or mean gap drifts over 100 ms from one second. | Harsh |
| Why did the fixed rule get 0% false alarms? | On this default condition it raised no alarms at all, so it also missed all ten message windows. | Harsh |
| Why can the clean-only baseline be bad? | A threshold learned in a clean network may treat ordinary noisy traffic as suspicious; the default example flags all ten ordinary windows. | Harsh |
| What does “100% detected” mean here? | Ten of ten message windows in this controlled simulated setting. It is not a universal accuracy claim. | Harsh |
| What is a false positive? | A normal window wrongly marked suspicious; it costs attention or causes unnecessary intervention. | Harsh |
| What do ROC and AUC mean? | ROC shows detection versus false alarms while the threshold changes; AUC summarizes that curve. These plots still use simulated data. | Harsh |
| What is the Stress matrix for? | It checks many combinations of channel subtlety, network variation, loss, detector choice, and metric so we can see failure cases. | Harsh |
| What does pacing do? | A model holds requests toward regular one-second release times. It may blur hidden timing, but adds delay for ordinary traffic. | Harsh |
| Is pacing deployed? | No. It is a causal browser model; a real relay needs implementation and measured network tests. | Harsh |
| What is the adaptive decoder? | It finds a dividing line between observed short and long gaps by clustering them into two groups; the fixed decoder uses one second. | Aarush |
| What happens if a request is lost? | Sequence numbers let the analysis omit gaps crossing a missing request. Missing bits still hurt recovery. The locked-note model itself adds jitter, not packet loss. | Aarush |
| Is the encryption real? | Yes. The browser uses Web Crypto AES-256-GCM, with a key derived from the phrase using PBKDF2 and a fresh random salt and IV. The timing delivery is modelled. | Aarush |
| Is the prefilled phrase secure? | It is a demo phrase. A real system would need a strong secret and a reviewed key-management design. | Aarush |
| Why does a two-letter note become 46 bytes? | Two text bytes plus 16 salt bytes, 12 IV bytes, and a 16-byte authentication tag. | Aarush |
| Why around six minutes? | 46 bytes make 368 bits; this model uses about one gap per bit at roughly one second per gap. | Aarush |
| Does encryption hide the timing channel? | It hides note contents. The guardian can still observe abnormal pauses, and noise can still corrupt the encrypted bytes. | Aarush |
| Why does one wrong bit break decryption? | AES-GCM verifies the whole encrypted package; if the key or authenticated bytes are wrong, it rejects the message. | Aarush |
| Is there a backend/database? | The demo is a browser app loading a local JSON bundle. Python prepares data and offers lab tools; interactive analysis and encryption run in the browser. | Aarush |
| What is the unique contribution? | One inspectable teaching/evaluation workflow joins encoding, receiver evidence, detection errors, defence cost, encrypted content, and provenance. We use established algorithms rather than claim a new cipher. | Aarush |
| What is your strongest honest result? | The software works on its controlled simulated examples and shows concrete trade-offs. Real-network performance remains unmeasured in the shipped bundle. | Aarush |
| What is next? | Collect repeated receiver-side ordinary and message runs on a closed lab testbed under clean/noisy/lossy conditions, separate training from testing, then report detection, false alarms, bit recovery, and added delay. | Aarush |

## Three answers the whole team must say the same way

1. **“Are these real lab measurements?”** “No. The shipped bundle has 610 simulated runs and zero included real receiver captures. The site labels them throughout.”
2. **“Did you invent the cipher or detection statistics?”** “No. The originality is in integrating them into a transparent sender–detective–guardian evaluation and teaching tool, and exposing the trade-offs.”
3. **“Is this production-ready network security?”** “No. It is a tested teaching and analysis tool. A real deployment needs capture data, field checks, traffic-cost measurements, and security review.”

## If the panel asks about tests or evidence quality

The local V2 passed 72 UI unit tests, 62 Python tests (2 skipped), a production build and size check, and 32 desktop/mobile browser checks (4 intentionally skipped). Browser checks include navigation, encryption success/failure, accessible controls, and layout widths. These checks support **software correctness**, not real-network accuracy. The evidence page includes report/data exports and clearly distinguishes software behaviour, simulation, and required real measurements.

## Terms to avoid mixing up

- **Detection rate** = message windows flagged / all message windows.
- **False-positive rate** = ordinary windows wrongly flagged / all ordinary windows.
- **Bit recovery** = correct bits / expected bits; a high percentage can still leave the whole encrypted note unreadable.
- **Encryption** protects content; **encoding** maps bits into timing; **detection** judges observed timing; **pacing** delays release to reduce that timing pattern.
- **Simulated run** is generated data. **Real capture** requires actual receiver-side packet timestamps and a trustworthy record of how they were collected.
