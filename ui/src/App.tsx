import { CommandLineIcon } from "@heroicons/react/20/solid";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { Button } from "./components/ui/Button";
import { ProvenanceBadge, provenanceOf } from "./components/ui/ProvenanceBadge";
import { ChartSkeleton, ErrorState } from "./components/ui/States";
import { useData } from "./lib/data/DataContext";
import { downloadBlob } from "./lib/exporting";
import { ROUTE_LABEL, ROUTES, useRoute, type Route } from "./lib/state/route";
import { useTheme, type ThemeChoice } from "./lib/state/theme";

const VIEWS: Record<Route, React.LazyExoticComponent<() => React.JSX.Element>> = {
  runs: lazy(() => import("./views/RunsView")),
  signal: lazy(() => import("./views/SignalView")),
  detectors: lazy(() => import("./views/DetectorsView")),
  stress: lazy(() => import("./views/StressView")),
  decode: lazy(() => import("./views/DecodeView")),
  evidence: lazy(() => import("./views/EvidenceView")),
};

const INTRO: Record<Route, string> = {
  runs: "Every run in the workbench: exported runs and the tshark CSVs you add. Label them and check their provenance here.",
  signal: "Gaps between Echo Requests over time, and how their distribution differs between two runs.",
  detectors: "Fixed rule against the learned baseline, live. Move the settings and watch every window's verdict change.",
  stress: "How detection holds up across gap settings and network conditions. Select a cell for its runs.",
  decode: "What the receiver recovers from a covert run, bit by bit, with a fixed or an adaptive threshold.",
  evidence: "Review 3 checklist, data coverage, limits, and exports.",
};

export default function App() {
  const { route, navigate } = useRoute();
  const { status, error, bundle, uploads, retry, bundleUrl } = useData();
  const { theme, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const View = VIEWS[route];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { document.title = `${ROUTE_LABEL[route]} · Cadence`; }, [route]);

  const sources = useMemo(() => {
    const s: ("simulated" | "capture")[] = [];
    if (bundle?.provenance.hasSimulated) s.push("simulated");
    if (bundle?.provenance.hasCapture || uploads.some((u) => u.source === "capture")) s.push("capture");
    if (uploads.some((u) => u.source === "simulated")) s.push("simulated");
    return s.length ? s : (["simulated"] as const);
  }, [bundle, uploads]);
  const prov = provenanceOf(sources);

  const commands: Command[] = useMemo(() => [
    ...ROUTES.map((r) => ({ id: `go-${r}`, label: `Go to ${ROUTE_LABEL[r]}`, hint: "view", run: () => navigate(r) })),
    ...(["system", "light", "dark"] as ThemeChoice[]).map((t) => ({ id: `theme-${t}`, label: `Theme: ${t}`, hint: "appearance", run: () => setTheme(t) })),
    { id: "add-csv", label: "Add tshark CSV files", hint: "runs", run: () => { navigate("runs", { add: "1" }); } },
    { id: "bundle", label: "Download the JSON bundle", hint: "export", run: () => fetch(bundleUrl).then((r) => r.blob()).then((b) => downloadBlob("cadence-bundle.json", b)) },
    { id: "print", label: "Print or save the Evidence report as PDF", hint: "export", run: () => { navigate("evidence"); setTimeout(() => window.print(), 400); } },
  ], [navigate, setTheme, bundleUrl]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <a href="#/runs" className="flex min-h-11 items-center gap-2 font-semibold text-ink" aria-label="Cadence, go to Runs">
            <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden><rect width="16" height="16" rx="3" fill="var(--accent)" /><path d="M3 11h2V5h2v6h2V7h2v4h2" stroke="var(--accent-ink)" strokeWidth="1.4" fill="none" /></svg>
            Cadence
          </a>
          <nav aria-label="Views" className="order-3 w-full md:order-none md:w-auto md:flex-1">
            <ul className="grid grid-cols-3 gap-1 md:flex md:flex-wrap">
              {ROUTES.map((r) => (
                <li key={r}>
                  <a href={`#/${r}`} aria-current={route === r ? "page" : undefined}
                    className={`flex min-h-11 items-center justify-center rounded-md px-3 text-sm ${route === r ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                    {ROUTE_LABEL[r]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setPaletteOpen(true)} icon={<CommandLineIcon className="size-4" aria-hidden />} aria-keyshortcuts="Control+K Meta+K">
              <span className="hidden sm:inline">Commands</span><span className="sr-only sm:hidden">Commands</span>
              <kbd className="hidden rounded border border-line px-1 font-mono text-[0.7rem] text-ink-3 lg:inline">Ctrl K</kbd>
            </Button>
            <label className="sr-only" htmlFor="theme">Theme</label>
            <select id="theme" value={theme} onChange={(e) => setTheme(e.target.value as ThemeChoice)}
              className="min-h-11 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink">
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
        <div role="note" aria-label="Data provenance" className={`border-t border-line ${prov === "capture" ? "bg-real-bg" : prov === "simulated" ? "bg-sim-bg" : "bg-surface-2"}`}>
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs text-ink">
            <ProvenanceBadge source={prov} />
            <span>
              {prov === "simulated" ? "Every number here comes from the simulator, not the lab testbed." :
                prov === "capture" ? "Numbers come from real captures." :
                "Simulated and real data are both loaded; each run, cell and chart says which it is."}
            </span>
            {bundle ? <span className="font-mono text-ink-2">bundle {bundle.schemaVersion} · {bundle.provenance.commit?.slice(0, 7) ?? "no commit"} · {uploads.length} added CSV{uploads.length === 1 ? "" : "s"}</span> : null}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 pb-16 pt-4 outline-none">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-ink">{ROUTE_LABEL[route]}</h1>
          <p className="max-w-prose text-sm text-ink-2">{INTRO[route]}</p>
        </div>
        {status === "error" ? (
          <ErrorState title="The data bundle did not load" message={`${error ?? "unknown error"}. Regenerate it with: python -m icmp_detector export-ui --out ui/public/data`} onRetry={retry} />
        ) : status === "loading" ? (
          <div className="grid gap-4 md:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div>
        ) : (
          <Suspense fallback={<div className="grid gap-4 md:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div>}>
            <View />
          </Suspense>
        )}
      </main>
      <footer className="no-print border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-ink-3">
          <span>Cadence · defensive analysis for an authorised closed lab testbed</span>
          <a className="inline-flex min-h-11 items-center underline" href="#/evidence">About this project</a>
        </div>
      </footer>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </>
  );
}
