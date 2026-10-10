import { AXIS } from "./ChartFrame";

/** Sent bits above decoded bits; wrong bits get a red outline and a cross, missing bits a "?". */
export function BitGrid({ width, sent, decoded }: { width: number; sent: string; decoded: string }) {
  const cell = 22;
  const labelW = 70;
  const perRow = Math.max(8, Math.floor((width - labelW - 8) / cell));
  const lines = Math.ceil(sent.length / perRow);
  const blockH = cell * 2 + 14;
  const height = lines * blockH + 4;
  return (
    <svg data-chart width={width} height={height} role="img" aria-label={`Sent ${sent.length} bits; ${[...sent].filter((b, i) => decoded[i] !== b).length} decoded wrong or missing`}>
      {Array.from({ length: lines }, (_, li) => {
        const y0 = li * blockH;
        const slice = [...sent].slice(li * perRow, (li + 1) * perRow);
        return (
          <g key={li}>
            <text x={labelW - 8} y={y0 + cell / 2 + 2} {...AXIS} textAnchor="end" dominantBaseline="middle">sent</text>
            <text x={labelW - 8} y={y0 + cell * 1.5 + 4} {...AXIS} textAnchor="end" dominantBaseline="middle">decoded</text>
            {slice.map((b, k) => {
              const i = li * perRow + k;
              const d = decoded[i] ?? "?";
              const wrong = d !== b;
              const x = labelW + k * cell;
              return (
                <g key={i}>
                  <rect x={x + 1} y={y0 + 2} width={cell - 2} height={cell - 2} rx={3} fill={b === "1" ? "var(--series-normal)" : "var(--surface-2)"} />
                  <text x={x + cell / 2} y={y0 + cell / 2 + 2} fontSize={11} fontFamily="var(--font-mono)" textAnchor="middle" dominantBaseline="middle" fill={b === "1" ? "#fff" : "var(--ink)"}>{b}</text>
                  <rect x={x + 1} y={y0 + cell + 4} width={cell - 2} height={cell - 2} rx={3} fill={d === "1" ? "var(--series-normal)" : "var(--surface-2)"}
                    stroke={wrong ? "var(--flag)" : "none"} strokeWidth={2.5} />
                  <text x={x + cell / 2} y={y0 + cell * 1.5 + 4} fontSize={11} fontFamily="var(--font-mono)" fontWeight={wrong ? 700 : 400} textAnchor="middle" dominantBaseline="middle" fill={d === "1" ? "#fff" : "var(--ink)"}>{wrong && d !== "?" ? "×" : d}</text>
                  {wrong ? <title>{`bit ${i}: sent ${b}, decoded ${d === "?" ? "nothing (packet lost)" : d}`}</title> : null}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
