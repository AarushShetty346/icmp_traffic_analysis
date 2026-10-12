import { useState } from "react";
import { bitsText, decodeBits } from "../lib/analysis/decode";
import { Panel } from "./ui/Panel";

const MAX_BYTES = 32;

export default function OwnMessageDemo() {
  const [message, setMessage] = useState("Hi");
  const bytes = new TextEncoder().encode(message);
  const tooLong = bytes.length > MAX_BYTES;
  const bits = tooLong ? "" : [...bytes].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  const gaps = [...bits].map((bit) => bit === "0" ? "0.75" : "1.25");
  const times = [0];
  for (const gap of gaps) times.push(times[times.length - 1] + Number(gap));
  const recoveredBits = bitsText(decodeBits(times, null, 1), bits.length);
  const recoveredBytes = recoveredBits.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? [];
  const recovered = new TextDecoder().decode(new Uint8Array(recoveredBytes));

  return (
    <Panel title="Try your own message" id="own-message" provenance="simulated">
      <p className="mb-3 max-w-prose text-sm text-ink-2">
        Each UTF-8 byte becomes eight bits. A 0 makes a 0.75 s gap between two simulated ping requests;
        a 1 makes a 1.25 s gap. The receiver uses 1 s as the dividing line to recover the bits.
        These ideal gaps have no jitter or lost packets, so recovery here is always perfect.
        This example runs only in your browser; it sends no packets.
      </p>
      <label htmlFor="demo-message" className="block text-sm font-medium text-ink-2">Message to encode</label>
      <input id="demo-message" type="text" value={message} onChange={(event) => setMessage(event.target.value)}
        aria-describedby="demo-message-help" aria-invalid={tooLong}
        className="mt-1 min-h-11 w-full max-w-md rounded-md border border-line-strong bg-surface px-3 text-sm text-ink" />
      <p id="demo-message-help" aria-live="polite" className="mt-1 text-xs text-ink-3">
        {tooLong ? `Use at most ${MAX_BYTES} UTF-8 bytes; this message has ${bytes.length}.` : `${bytes.length} of ${MAX_BYTES} UTF-8 bytes.`}
      </p>
      {!tooLong && message ? (
        <dl className="mt-4 grid gap-3 text-sm">
          <div><dt className="font-medium text-ink">Encoded bits</dt><dd className="font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">{bits}</dd></div>
          <div><dt className="font-medium text-ink">Packet gaps (seconds)</dt><dd className="font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">{gaps.slice(0, 24).join(" · ")}{gaps.length > 24 ? ` · … (${gaps.length} gaps total)` : ""}</dd></div>
          <div><dt className="font-medium text-ink">Decoded bits</dt><dd className="font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">{recoveredBits}</dd></div>
          <div><dt className="font-medium text-ink">Recovered message</dt><dd className="font-semibold text-ink">{recovered}</dd></div>
        </dl>
      ) : !tooLong ? <p className="mt-4 text-sm text-ink-3">Type a message to see its bit pattern and packet gaps.</p> : null}
    </Panel>
  );
}
