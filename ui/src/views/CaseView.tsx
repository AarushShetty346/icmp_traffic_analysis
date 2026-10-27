import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, EyeIcon, LockClosedIcon, ShieldCheckIcon, SignalIcon, SparklesIcon, XCircleIcon } from "@heroicons/react/20/solid";
import { useEffect, useMemo, useState } from "react";
import { consecutiveGaps } from "../lib/analysis/detect";
import { buildBaseline, classifyBaseline } from "../lib/analysis/detect";
import { windows } from "../lib/analysis/features";
import { mean, std } from "../lib/analysis/stats";
import type { Run } from "../lib/data/runs";
import { useData } from "../lib/data/DataContext";
import { bytesToBits, lockMessage, simulateLockedMessage, unlockMessage } from "../lib/case/crypto";
import { analyseCase, bitRecovery, CASE_CHANNELS, CASE_CONDITIONS, paceRun, type CaseChannel, type CaseCondition, type GuardianMode } from "../lib/case/experiment";
import { useRoute } from "../lib/state/route";
import { bundleSet } from "../lib/view/select";

const STEPS = [
  { short: "The idea", title: "A message in the pauses", icon: SignalIcon },
  { short: "Detective", title: "Follow the timing clue", icon: EyeIcon },
  { short: "Guardian", title: "Make the call", icon: ShieldCheckIcon },
  { short: "Locked note", title: "What if the note is encrypted?", icon: LockClosedIcon },
  { short: "Case closed", title: "What we learned", icon: CheckCircleIcon },
] as const;

const pct = (x: number | null | undefined) => x == null || !Number.isFinite(x) ? "—" : `${Math.round(x * 100)}%`;
const ms = (x: number) => `${Math.round(x * 1000)} ms`;
const duration = (seconds: number) => `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`;
const CHANNEL_GAPS: Record<CaseChannel, [number, number]> = { "0.75/1.25 s": [0.75, 1.25], "0.95/1.05 s": [0.95, 1.05], "0.98/1.02 s": [0.98, 1.02] };
const JITTER_CONDITION: Record<number, CaseCondition> = { 0: "clean", 20: "jitter 20 ms", 50: "jitter 50 ms", 100: "jitter 100 ms" };

function PlainTerm({ children, meaning }: { children: string; meaning: string }) {
  return <span className="plain-term" title={meaning} tabIndex={0}>{children}<span className="sr-only">: {meaning}</span></span>;
}

function TraceChart({ reference, suspect }: { reference: Run; suspect: Run }) {
  const a = consecutiveGaps(reference.times, reference.seq).slice(0, 31);
  const b = consecutiveGaps(suspect.times, suspect.seq).slice(0, 31);
  const all = [...a, ...b, 1];
  const low = Math.floor((Math.min(...all) - 0.015) * 1000 / 25) * 25;
  const high = Math.ceil((Math.max(...all) + 0.015) * 1000 / 25) * 25;
  const x = (i: number) => 58 + i * 20.5;
  const y = (v: number) => 195 - ((v * 1000 - low) / Math.max(1, high - low)) * 150;
  const line = (values: number[]) => values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const ticks = [low, Math.round((low + high) / 2), high];
  return <figure className="trace-wrap">
    <svg viewBox="0 0 720 254" role="img" aria-label="Arrival gap chart comparing an ordinary reference run with the case recording. Horizontal position is packet gap number; vertical position is gap length in milliseconds.">
      <defs><linearGradient id="traceFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fb774f" stopOpacity=".19"/><stop offset="1" stopColor="#fb774f" stopOpacity="0"/></linearGradient></defs>
      {ticks.map((tick) => <g key={tick}><line x1="58" x2="690" y1={y(tick / 1000)} y2={y(tick / 1000)} className="trace-grid"/><text x="48" y={y(tick / 1000) + 4} textAnchor="end" className="trace-label">{tick}</text></g>)}
      <text x="8" y="22" className="trace-axis-title">milliseconds</text>
      <polyline points={line(a)} fill="none" className="trace-reference" />
      <polyline points={line(b)} fill="none" className="trace-suspect" />
      <text x="58" y="238" className="trace-label">earlier requests</text><text x="690" y="238" textAnchor="end" className="trace-label">later requests →</text>
    </svg>
    <figcaption><span><i className="legend-dot ordinary" />Ordinary reference</span><span><i className="legend-dot suspect" />Case recording</span></figcaption>
  </figure>;
}

function StageControls({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  return <div className="case-next-row">
    {step > 0 ? <button className="case-button subtle" onClick={() => setStep(step - 1)}><ArrowLeftIcon className="size-4" aria-hidden /> Previous chapter</button> : <span />}
    {step < STEPS.length - 1 ? <button className="case-button primary" onClick={() => setStep(step + 1)}>Continue: {STEPS[step + 1].short} <ArrowRightIcon className="size-4" aria-hidden /></button> : <button className="case-button primary" onClick={() => setStep(0)}>Restart the case <ArrowRightIcon className="size-4" aria-hidden /></button>}
  </div>;
}

export default function CaseView() {
  const { runs, status } = useData();
  const { params, setParams } = useRoute();
  const step = Math.min(STEPS.length - 1, Math.max(0, Number(params.get("step") ?? 0) || 0));
  const [message, setMessage] = useState("HI");
  const [condition, setCondition] = useState<CaseCondition>("jitter 50 ms");
  const [channel, setChannel] = useState<CaseChannel>("0.95/1.05 s");
  const [caseKind, setCaseKind] = useState<"normal" | "covert">("covert");
  const [guess, setGuess] = useState<"normal" | "covert" | null>(null);
  const [mode, setMode] = useState<GuardianMode>("matched");
  const [buffer, setBuffer] = useState(0.5);
  const [senderKey, setSenderKey] = useState("cadence-demo-key");
  const [receiverKey, setReceiverKey] = useState("cadence-demo-key");
  const [showKeys, setShowKeys] = useState(false);
  const [wire, setWire] = useState<Uint8Array | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState("");
  const [receiveResult, setReceiveResult] = useState<{ kind: "success" | "failure"; text: string } | null>(null);
  const [cryptoJitter, setCryptoJitter] = useState(0);
  const [cryptoChannel, setCryptoChannel] = useState<CaseChannel>("0.95/1.05 s");
  const textBytes = new TextEncoder().encode(message);
  const messageBits = bytesToBits(textBytes);
  const tooLong = textBytes.length > 32;
  const analysis = useMemo(() => analyseCase(runs, condition, channel), [runs, condition, channel]);
  const suspect = caseKind === "covert" ? analysis?.covert : analysis?.normal;
  const regular = analysis?.reference;
  const referenceGaps = regular ? consecutiveGaps(regular.times, regular.seq).slice(0, 31) : [];
  const caseGaps = suspect ? consecutiveGaps(suspect.times, suspect.seq).slice(0, 31) : [];
  const decision = analysis?.decisions[mode];
  const pacedCovert = useMemo(() => analysis ? paceRun(analysis.covert, buffer) : null, [analysis, buffer]);
  const pacedNormal = useMemo(() => analysis ? paceRun(analysis.normal, buffer) : null, [analysis, buffer]);
  const before = analysis ? bitRecovery(analysis.covert, analysis.covert.times) : null;
  const after = analysis && pacedCovert ? bitRecovery(analysis.covert, pacedCovert.times) : null;
  const simulation = useMemo(() => {
    if (!wire) return null;
    const [gap0, gap1] = CHANNEL_GAPS[cryptoChannel];
    return simulateLockedMessage(wire, gap0, gap1, cryptoJitter);
  }, [wire, cryptoChannel, cryptoJitter]);
  const cryptoGuardian = useMemo(() => {
    if (!simulation) return null;
    const set = bundleSet(runs, "netem", JITTER_CONDITION[cryptoJitter], cryptoChannel, "matched");
    if (!set.baseline.length) return null;
    const baseline = buildBaseline(set.baseline.map((r) => ({ times: r.times, seq: r.seq })), 32);
    const chunks = windows(simulation.times, 32);
    const flagged = chunks.filter((chunk) => classifyBaseline(chunk, baseline, ["std"]).suspicious).length;
    return { flagged, total: chunks.length };
  }, [simulation, runs, cryptoJitter, cryptoChannel]);

  useEffect(() => { setGuess(null); }, [condition, channel, caseKind]);
  useEffect(() => {
    if (!simulation) { setReceiveResult(null); return; }
    let cancelled = false;
    setReceiveResult(null);
    unlockMessage(simulation.received, receiverKey)
      .then((text) => { if (!cancelled) setReceiveResult({ kind: "success", text }); })
      .catch(() => { if (!cancelled) setReceiveResult({ kind: "failure", text: "The lock would not open. The key is wrong or at least one encrypted bit changed." }); });
    return () => { cancelled = true; };
  }, [simulation, receiverKey]);

  const setStep = (n: number) => { setParams({ step: n === 0 ? null : n }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const lock = async () => {
    setLockError(""); setLocking(true); setWire(null);
    try { setWire(await lockMessage(message, senderKey)); setReceiverKey(senderKey); }
    catch (e) { setLockError(e instanceof Error ? e.message : String(e)); }
    finally { setLocking(false); }
  };

  return <div className="case-page">
    <div className="case-topline"><span>ICMP TIMING CHANNELS / GUIDED ANALYSIS</span><span>SIMULATED DATASET</span></div>
    <nav className="case-progress" aria-label="Case chapters">
      {STEPS.map(({ short, icon: Icon }, i) => <button key={short} aria-label={`Chapter ${i + 1}: ${short}`} className={i === step ? "current" : i < step ? "seen" : ""} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}><span className="case-step-icon"><Icon className="size-4" aria-hidden /></span><span><small>0{i + 1}</small>{short}</span></button>)}
    </nav>

    {step === 0 ? <>
      <section className="case-hero">
        <div className="case-hero-copy"><span className="eyebrow">GUIDED INVESTIGATION</span><h1>Hidden messages in <em>ping timing</em></h1><p>A ping normally arrives about once a second. A sender can change the pauses to encode a message. Examine the evidence, test a detector, and see what encryption changes.</p><div className="case-hero-actions"><button className="case-button light" onClick={() => setStep(1)}>Start the investigation <ArrowRightIcon className="size-4" aria-hidden /></button><span>Five short steps · explanations at each step</span></div></div>
        <div className="case-hero-art" aria-hidden="true"><div className="hero-art-top"><span>THE TIMING CHANNEL</span><span>CONCEPT DIAGRAM</span></div><svg viewBox="0 0 480 220"><path d="M26 112 H454" stroke="#d7dce0" strokeWidth="2" strokeDasharray="4 8"/><path d="M35 111 H158" stroke="#2a78d6" strokeWidth="3"/><path d="M159 111 H288" stroke="#eb6834" strokeWidth="3"/><path d="M289 111 H427" stroke="#2a78d6" strokeWidth="3"/>{[35,159,289,427].map((x,i)=><g key={x}><circle cx={x} cy="111" r="16" fill={i===2?"#eb6834":"#2a78d6"} fillOpacity=".13"/><circle cx={x} cy="111" r="5" fill={i===2?"#eb6834":"#2a78d6"}/></g>)}<text x="90" y="88" fill="#4b5961" fontSize="13">short pause</text><text x="205" y="152" fill="#aa4b24" fontSize="13">long pause</text><text x="98" y="189" fill="#1b5ca5" fontSize="22" fontWeight="700">0</text><text x="228" y="189" fill="#b44e27" fontSize="22" fontWeight="700">1</text></svg><div className="hero-art-bottom">Identical packets; information carried by the pauses.</div></div>
      </section>
      <div className="case-study-strip" aria-label="Study overview">
        <div><span>INCLUDED DATA</span><strong>{runs.filter((run) => run.origin === "bundle").length} simulated recordings</strong></div>
        <div><span>COMPARISON</span><strong>Ordinary and message-carrying pings</strong></div>
        <div><span>MEASURED HERE</span><strong>Timing, detection, recovery, delay</strong></div>
        <div><span>REAL CAPTURES IN BUNDLE</span><strong>None yet</strong></div>
      </div>
      <section className="case-white-card case-lesson"><div className="case-section-heading"><span className="eyebrow">HOW THE CHANNEL WORKS</span><h2>Turn a note into packet timing</h2><p>A <PlainTerm meaning="A small network message. Here, each one is a ping request.">packet</PlainTerm> is like a little envelope. Its contents stay the same; the sender changes the wait between envelopes.</p></div>
        <div className="case-lesson-layout"><div><label className="case-label" htmlFor="case-message">Your short note</label><input id="case-message" className="case-input" value={message} onChange={(e) => { setMessage(e.target.value); setWire(null); }} maxLength={32} /><p className="case-help">{textBytes.length} of 32 UTF-8 bytes. A byte is a group of eight 0s or 1s; some characters use more than one byte.</p><div className="case-mini-callout"><strong>For this example:</strong><span><b>0</b> = wait 0.75 seconds</span><span><b>1</b> = wait 1.25 seconds</span></div></div><div className="case-bit-panel"><div className="case-bit-top"><span>YOUR NOTE AS BITS</span><span>{messageBits.length} bits</span></div><div className="case-bit-stream" aria-label={`First ${Math.min(messageBits.length,32)} bits of your note`}>{messageBits.slice(0, 32).map((bit, i) => <span key={i} className={bit ? "one" : "zero"} title={bit ? "1: long pause" : "0: short pause"}>{bit}</span>)}{messageBits.length > 32 ? <b>+{messageBits.length - 32}</b> : null}</div><p>Each square becomes one wait between two ping requests. This simple preview sends no packets.</p></div></div>
      </section>
      <section className="case-roles"><div><span>01</span><strong>Sender</strong><p>Chooses the pauses.</p></div><ArrowRightIcon className="size-5" aria-hidden /><div><span>02</span><strong>Network</strong><p>Adds variable delay.</p></div><ArrowRightIcon className="size-5" aria-hidden /><div><span>03</span><strong>Detective</strong><p>Looks for a pattern.</p></div><ArrowRightIcon className="size-5" aria-hidden /><div><span>04</span><strong>Guardian</strong><p>Decides whether to act.</p></div></section>
    </> : null}

    {step === 1 ? <section className="case-chapter">
      <div className="case-chapter-heading"><span className="eyebrow">CHAPTER 02 / DETECTIVE</span><h1>Follow the timing clue.</h1><p>You have one reference recording of ordinary pings and one case recording. Each dot on the graph is the wait between two received requests. The question is whether the case has a deliberate pattern.</p></div>
      <div className="case-split"><div className="case-white-card"><div className="case-card-title"><span className="case-icon amber"><EyeIcon className="size-5" aria-hidden /></span><div><h2>Choose the conditions</h2><p>These recordings were generated for a controlled example.</p></div></div><label className="case-label" htmlFor="case-noise">Network delay variation</label><select id="case-noise" className="case-select" value={condition} onChange={(e) => setCondition(e.target.value as CaseCondition)}>{CASE_CONDITIONS.map((x) => <option key={x} value={x}>{x === "clean" ? "Clean · almost no added variation" : x.replace("jitter", "Variation of")}</option>)}</select><p className="case-help">“Jitter” means the network delay changes from packet to packet. 50 ms = 0.05 seconds.</p><label className="case-label" htmlFor="case-channel">How subtle is the hidden timing?</label><select id="case-channel" className="case-select" value={channel} onChange={(e) => setChannel(e.target.value as CaseChannel)}>{CASE_CHANNELS.map((x) => <option key={x} value={x}>{x} · {x === "0.75/1.25 s" ? "obvious" : x === "0.95/1.05 s" ? "subtle" : "very subtle"}</option>)}</select><p className="case-help">The first number is the wait for 0; the second is the wait for 1. Closer together is harder to spot.</p><div className="case-choice-row"><button className={caseKind === "covert" ? "selected" : ""} onClick={() => setCaseKind("covert")}>Case file A</button><button className={caseKind === "normal" ? "selected" : ""} onClick={() => setCaseKind("normal")}>Case file B</button></div><p className="case-help">The answer stays hidden until you make your call. Both cases use the same kind of data.</p></div>
      <div className="case-white-card case-chart-card">
        <div className="case-card-title"><span className="case-icon teal"><SignalIcon className="size-5" aria-hidden /></span><div><h2>Packet pauses, side by side</h2><p>Higher points mean a longer wait. The orange line is the recording you are judging.</p></div></div>
        {analysis && suspect && regular ? <TraceChart reference={regular} suspect={suspect} /> : <div className="case-loading">{status === "loading" ? "Loading the prepared recordings…" : "No prepared runs for this combination."}</div>}
        {referenceGaps.length && caseGaps.length ? <div className="case-measurements" aria-label="Measurements from the displayed packet gaps">
          <div><span>Average pause</span><strong>{ms(mean(caseGaps))}</strong><small>Reference: {ms(mean(referenceGaps))}</small></div>
          <div><span>Typical variation (std)</span><strong>{ms(std(caseGaps))}</strong><small>Reference: {ms(std(referenceGaps))}</small></div>
          <div><span>Spread of pauses</span><strong>{ms(Math.max(...caseGaps) - Math.min(...caseGaps))}</strong><small>Reference: {ms(Math.max(...referenceGaps) - Math.min(...referenceGaps))}</small></div>
        </div> : null}
        <p className="case-chart-note">These measurements use the 31 gaps shown above. A second is 1,000 milliseconds (ms). Variation describes how much the pauses move around their average; spread is the longest minus the shortest pause.</p>
      </div></div>
      <div className="case-white-card case-verdict"><div><span className="eyebrow">YOUR CALL</span><h2>What do you think the orange recording is?</h2><p>You can change your mind after seeing the answer. A graph is a clue, not proof of intent.</p></div><div className="case-verdict-buttons"><button onClick={() => setGuess("covert")} className={guess === "covert" ? "picked" : ""}>A hidden message</button><button onClick={() => setGuess("normal")} className={guess === "normal" ? "picked" : ""}>Ordinary pings</button></div>{guess && analysis ? <div className={`case-answer ${guess === caseKind ? "correct" : "incorrect"}`} role="status"><strong>{guess === caseKind ? "Good call." : "Easy to miss—that is why we measure it."} Case file {caseKind === "covert" ? "A contains a deliberately hidden message" : "B is ordinary traffic"}.</strong><span>This is a labelled simulated run, so we know how it was made. Its first chunk has typical timing variation of {ms(analysis.suspectVariation[caseKind])}. Next, let the guardian judge it using a repeatable rule.</span></div> : null}</div>
    </section> : null}

    {step === 2 ? <section className="case-chapter">
      <div className="case-chapter-heading"><span className="eyebrow">CHAPTER 03 / GUARDIAN</span><h1>Detection and its trade-offs</h1><p>The guardian examines groups of 32 requests. Compare three rules below. A useful rule catches hidden messages while keeping false alarms on ordinary traffic low.</p></div>
      <div className="guardian-options" role="group" aria-label="Choose a guardian rule"><button className={mode === "fixed" ? "active" : ""} onClick={() => setMode("fixed")}><span>01 / FIXED THRESHOLD</span><strong>Fixed limit</strong><small>Alarm when typical variation exceeds 100 ms or the average moves too far from one second.</small></button><button className={mode === "matched" ? "active" : ""} onClick={() => setMode("matched")}><span>02 / MATCHED BASELINE</span><strong>Same conditions</strong><small>Learn normal timing under the same network variation as the test.</small></button><button className={mode === "clean" ? "active" : ""} onClick={() => setMode("clean")}><span>03 / MISMATCHED BASELINE</span><strong>Clean-only baseline</strong><small>Learn normal timing on a clean network, then face {condition}.</small></button></div>
      {analysis && decision ? <><div className="guardian-results"><div className="guardian-result main"><span>CASE FILE {caseKind === "covert" ? "A" : "B"}</span><strong className={decision[caseKind] ? "alarm" : "quiet"}>{decision[caseKind] ? "Alarm raised" : "No alarm"}</strong><p>The recording is actually <b>{caseKind === "covert" ? "message-carrying" : "ordinary"}</b>. {decision[caseKind] === (caseKind === "covert") ? "This call is correct." : "This call is a mistake."}</p></div><div className="guardian-result"><span>MESSAGES CAUGHT</span><strong>{pct(decision.rates.detectionRate)}</strong><p>{decision.rates.tp} of {analysis.covertWindows} message-carrying chunks flagged.</p></div><div className="guardian-result"><span>FALSE ALARMS</span><strong>{pct(decision.rates.falsePositiveRate)}</strong><p>{decision.rates.fp} of {analysis.normalWindows} ordinary chunks wrongly flagged.</p></div></div>
      <div className="case-white-card case-verdict-map"><div><h2>Verdict by observation window</h2><p>Each square is a group of 32 requests. A red square means the rule raised an alarm.</p></div><div className="verdict-map-row"><strong>Ordinary traffic</strong><div aria-label="Ordinary traffic verdicts">{decision.normalVerdicts.map((flagged, i) => <span key={i} role="img" className={flagged ? "flagged" : "clear"} title={`Ordinary group ${i + 1}: ${flagged ? "false alarm" : "correctly clear"}`} aria-label={`Ordinary group ${i + 1}: ${flagged ? "false alarm" : "correctly clear"}`} />)}</div><small>{decision.rates.fp} false alarms</small></div><div className="verdict-map-row"><strong>Message-carrying traffic</strong><div aria-label="Message traffic verdicts">{decision.covertVerdicts.map((flagged, i) => <span key={i} role="img" className={flagged ? "flagged" : "clear"} title={`Message group ${i + 1}: ${flagged ? "caught" : "missed"}`} aria-label={`Message group ${i + 1}: ${flagged ? "caught" : "missed"}`} />)}</div><small>{decision.rates.tp} messages caught</small></div></div>
      <div className="case-explanation"><strong>Why did the guardian make that call?</strong><p>The first chunk’s pauses have typical variation of <b>{ms(analysis.suspectVariation[caseKind])}</b>. {mode === "fixed" ? "The fixed rule’s variation limit is 100 ms; it also checks whether the average moves more than 100 ms from one second." : `The learned normal variation limit is ${ms(mode === "matched" ? analysis.matchedLimit : analysis.cleanLimit)}. It came from ${mode === "matched" ? "normal runs under these same conditions" : "clean normal runs"}.`} This is one clue; the rates above count every complete test chunk.</p><a href="#/detectors">Open all detector settings in the advanced lab →</a></div></> : <div className="case-loading">Loading detector evidence…</div>}
      <div className="case-white-card pace-card"><div className="case-card-title"><span className="case-icon teal"><ShieldCheckIcon className="size-5" aria-hidden /></span><div><h2>Try a second defence: pace the packets</h2><p>A teaching model of a relay holds arriving requests until regular one-second release slots when it can. This can blur the message, but it adds delay.</p></div></div><label className="case-label" htmlFor="pace-buffer">Initial waiting room: <b>{Math.round(buffer * 1000)} ms</b></label><input id="pace-buffer" type="range" min="0" max="1000" step="50" value={Math.round(buffer * 1000)} onChange={(e) => setBuffer(Number(e.target.value) / 1000)} /><p className="case-help">The relay can only hold packets, never release one before it arrives. More waiting gives it more room to enforce a steady pace.</p><div className="pace-stats"><div><span>Hidden bits read before pacing</span><strong>{pct(before)}</strong></div><ArrowRightIcon className="size-5" aria-hidden /><div><span>Hidden bits read afterward</span><strong>{pct(after)}</strong></div><div><span>Extra wait for ordinary pings</span><strong>+{pacedNormal ? ms(pacedNormal.averageAddedDelay) : "—"}</strong></div></div><p className="case-caveat">This relay is a simulation model, not a deployed router. It shows the trade-off we would need to test with real captures.</p></div>
    </section> : null}

    {step === 3 ? <section className="case-chapter">
      <div className="case-chapter-heading"><span className="eyebrow">FINAL EXPERIMENT / THE LOCKED NOTE</span><h1>The guardian sees the pattern. Can it read the note?</h1><p>Now lock your note with AES-GCM, a real browser encryption method. The sender turns the locked bytes into timing bits. The intended receiver has the key; a guardian watching the pauses does not.</p></div>
      <div className="crypto-flow"><div><span>01</span><strong>Your note</strong><small>{message || "No note yet"}</small></div><ArrowRightIcon className="size-5" aria-hidden /><div><span>02</span><strong>Lock with key</strong><small>AES-GCM in this browser</small></div><ArrowRightIcon className="size-5" aria-hidden /><div><span>03</span><strong>Timing bits</strong><small>Short and long waits</small></div><ArrowRightIcon className="size-5" aria-hidden /><div><span>04</span><strong>Receiver</strong><small>Unlock if all bits survive</small></div></div>
      <div className="case-split crypto-layout"><div className="case-white-card"><div className="case-card-title"><span className="case-icon amber"><LockClosedIcon className="size-5" aria-hidden /></span><div><h2>Lock the note</h2><p>Everything happens in this browser. No pings or keys are sent anywhere.</p></div></div><label className="case-label" htmlFor="crypto-note">Note</label><input id="crypto-note" className="case-input" value={message} onChange={(e) => { setMessage(e.target.value); setWire(null); }} maxLength={32} /><label className="case-label" htmlFor="sender-key">Shared key phrase</label><input id="sender-key" type={showKeys ? "text" : "password"} className="case-input" value={senderKey} onChange={(e) => { setSenderKey(e.target.value); setWire(null); }} autoComplete="new-password" /><button className="crypto-wrong-key" onClick={() => setShowKeys((x) => !x)} aria-pressed={showKeys}>{showKeys ? "Hide key phrases" : "Show key phrases"}</button><p className="case-help">Use the same phrase at the receiver. A demo phrase is filled in; choose a strong private key for real secrets.</p><button className="case-button primary crypto-lock" onClick={lock} disabled={locking || tooLong || !message || !senderKey}>{locking ? "Locking…" : "Lock this note"} <LockClosedIcon className="size-4" aria-hidden /></button>{lockError ? <p className="case-error" role="alert">{lockError}</p> : null}</div>
      <div className="case-white-card"><div className="case-card-title"><span className="case-icon teal"><SignalIcon className="size-5" aria-hidden /></span><div><h2>Send the locked bits through a model</h2><p>Choose timing and variation. The estimate uses roughly one second per bit.</p></div></div><label className="case-label" htmlFor="crypto-timing">Timing pattern</label><select id="crypto-timing" className="case-select" value={cryptoChannel} onChange={(e) => setCryptoChannel(e.target.value as CaseChannel)}>{CASE_CHANNELS.map((c) => <option value={c} key={c}>{c} · {c === "0.75/1.25 s" ? "obvious" : c === "0.95/1.05 s" ? "subtle" : "very subtle"}</option>)}</select><label className="case-label" htmlFor="crypto-jitter">Network delay variation</label><select id="crypto-jitter" className="case-select" value={cryptoJitter} onChange={(e) => setCryptoJitter(Number(e.target.value))}><option value="0">Clean · begin here</option><option value="20">20 ms · a little variation</option><option value="50">50 ms · noticeable variation</option><option value="100">100 ms · heavy variation</option></select>{wire ? <div className="crypto-facts"><div><span>Original note</span><strong>{textBytes.length} bytes</strong></div><div><span>Locked package</span><strong>{wire.length} bytes</strong></div><div><span>Pauses needed</span><strong>{wire.length * 8} bits</strong></div><div><span>Estimated time</span><strong>{duration(wire.length * 8)}</strong></div></div> : <div className="crypto-placeholder">Lock the note to see how many timing bits it needs.</div>}<p className="case-help">The locked package includes a random salt, a one-time value, and an integrity check. These make it much longer than the original text.</p></div></div>
      {wire && simulation ? <div className="case-white-card crypto-receiver"><div className="case-card-title"><span className="case-icon violet"><SparklesIcon className="size-5" aria-hidden /></span><div><h2>What did the guardian and receiver see?</h2><p>The guardian checks the timing without a key. The receiver reads the bits, then tries to unlock the note.</p></div></div><div className="crypto-result-grid"><div><span>TIMING BITS RECOVERED CORRECTLY</span><strong>{pct(simulation.bitAccuracy)}</strong><small>{Math.round(simulation.bitAccuracy * wire.length * 8)} of {wire.length * 8} bits</small></div><div><span>WITH THE RECEIVER’S KEY</span><label className="sr-only" htmlFor="receiver-key">Receiver key phrase</label><input id="receiver-key" type={showKeys ? "text" : "password"} className="case-input" value={receiverKey} onChange={(e) => setReceiverKey(e.target.value)} autoComplete="new-password" /><button className="crypto-wrong-key" onClick={() => setReceiverKey("wrong-key")}>Try a wrong key</button></div><div className={receiveResult?.kind === "success" ? "crypto-success" : "crypto-failure"}><span>UNLOCK RESULT</span><strong>{receiveResult?.kind === "success" ? receiveResult.text : receiveResult?.kind === "failure" ? "Could not unlock" : "Checking…"}</strong><small>{receiveResult?.kind === "failure" ? receiveResult.text : "Correct key and unchanged encrypted bytes are both required."}</small></div></div><div className="crypto-guardian"><ShieldCheckIcon className="size-5" aria-hidden /><div><strong>Guardian result: {cryptoGuardian ? `${cryptoGuardian.flagged} of ${cryptoGuardian.total} timing chunks flagged` : "waiting for reference recordings"}.</strong><span>It uses a normal-traffic baseline for this network setting. It sees packet pauses, never the key or note.</span></div></div><p className="case-caveat">A single wrong encrypted bit can make AES-GCM reject the entire note. This model adds timing variation but no packet loss. It does not transmit real ICMP traffic.</p></div> : null}
      <div className="case-insight"><strong>The point:</strong> the guardian can see unusual timing without the key. Encryption protects the contents, while the timing pattern can still be investigated. Reliable encrypted delivery over such a slow, noisy channel is a separate challenge.</div>
    </section> : null}

    {step === 4 ? <section className="case-chapter case-close"><div className="case-close-hero"><span className="eyebrow">CASE CLOSED / QUESTIONS OPEN</span><h1>You now know what this project is asking.</h1><p>A hidden timing message may be readable, detectable, both, or neither. A guardian’s job is harder than shouting “alarm”: it must also avoid accusing normal traffic and avoid making the network unusable.</p></div><div className="case-close-grid"><div><span>01 / DETECTIVE</span><h2>Look at arrival times.</h2><p>Compare ordinary and suspect packet pauses. Network variation makes simple patterns harder to trust.</p></div><div><span>02 / GUARDIAN</span><h2>Count both kinds of mistake.</h2><p>Measure hidden messages caught and ordinary traffic wrongly flagged. A pacing defence also has a delay cost.</p></div><div><span>03 / LOCKED NOTE</span><h2>Content and timing are different.</h2><p>An encrypted note can be unreadable without a key while its timing remains suspicious.</p></div></div><div className="case-honesty"><XCircleIcon className="size-6" aria-hidden /><div><h2>The claim we can make today</h2><p>These interactions use the shipped simulated recordings and a browser model. They demonstrate how the methods behave in that model. There are <strong>no included real lab captures yet</strong>, so the final claim about a real network still needs measured receiver captures.</p></div></div><div className="case-close-actions"><a href="#/lab" className="case-button primary">Explore the full lab <ArrowRightIcon className="size-4" aria-hidden /></a><a href="#/evidence" className="case-button subtle">Inspect evidence and limits <ArrowRightIcon className="size-4" aria-hidden /></a></div></section> : null}
    <StageControls step={step} setStep={setStep} />
  </div>;
}
