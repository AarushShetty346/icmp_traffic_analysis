import {
  ChevronRightIcon, ClipboardDocumentCheckIcon, LockOpenIcon, ShieldExclamationIcon, SignalIcon, Squares2X2Icon, TableCellsIcon,
} from "@heroicons/react/20/solid";
import { lazy, Suspense, useEffect, useMemo } from "react";
import EvidenceView from "./views/EvidenceView";
import RunsView from "./views/RunsView";
import { ProvenanceBadge, provenanceOf } from "./components/ui/ProvenanceBadge";
import { ChartSkeleton, ErrorState } from "./components/ui/States";
import { useData } from "./lib/data/DataContext";
import { ROUTE_LABEL, ROUTES, useRoute, type Route } from "./lib/state/route";

// Runs (the landing view) and Evidence are bundled eagerly and render before the data arrives.
const VIEWS: Record<Route, React.ComponentType> = {
  runs: RunsView,
  signal: lazy(() => import("./views/SignalView")),
  detectors: lazy(() => import("./views/DetectorsView")),
  stress: lazy(() => import("./views/StressView")),
  decode: lazy(() => import("./views/DecodeView")),
  evidence: EvidenceView,
};

const ICON: Record<Route, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  runs: TableCellsIcon,
  signal: SignalIcon,
  detectors: ShieldExclamationIcon,
  stress: Squares2X2Icon,
  decode: LockOpenIcon,
  evidence: ClipboardDocumentCheckIcon,
};

// The URL parameter that pins one run in a view; when set, a breadcrumb leads back to Runs.
const RUN_PARAM: Partial<Record<Route, string>> = { signal: "a", decode: "run" };

const INTRO: Record<Route, string> = {
  runs: "See how the project works, then explore simulated runs or add a lab capture.",
  signal: "Gaps between Echo Requests over time, and how their distribution differs between two runs.",
  detectors: "Fixed rule against the learned baseline, live. Move the settings and watch every window's verdict change.",
  stress: "How detection holds up across gap settings and network conditions. Select a cell for its runs.",
  decode: "Try a message of your own, then inspect what the receiver recovers from prepared runs.",
  evidence: "Review 3 checklist, data coverage, limits, and exports.",
};

export default function App() {
  const { route, params } = useRoute();
  const { status, error, bundle, uploads, runs, retry } = useData();
  const pinnedRun = RUN_PARAM[route] ? runs.find((r) => r.id === params.get(RUN_PARAM[route]!)) : undefined;
  const View = VIEWS[route];

  useEffect(() => { document.title = `${ROUTE_LABEL[route]} · Cadence`; }, [route]);

  const sources = useMemo(() => {
    const s: ("simulated" | "capture")[] = [];
    if (bundle?.provenance.hasSimulated) s.push("simulated");
    if (bundle?.provenance.hasCapture || uploads.some((u) => u.source === "capture")) s.push("capture");
    if (uploads.some((u) => u.source === "simulated")) s.push("simulated");
    return s.length ? s : (["simulated"] as const);
  }, [bundle, uploads]);
  const prov = provenanceOf(sources);

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
              {ROUTES.map((r) => {
                const Icon = ICON[r];
                return (
                  <li key={r}>
                    <a href={`#/${r}`} aria-current={route === r ? "page" : undefined}
                      className={`pressable flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-xs md:flex-row md:gap-1.5 md:px-3 md:py-0 md:text-sm ${route === r ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {ROUTE_LABEL[r]}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <div role="note" aria-label="Data provenance" className={`border-t border-line ${prov === "capture" ? "bg-real-bg" : prov === "simulated" ? "bg-sim-bg" : "bg-surface-2"}`}>
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs text-ink">
            <ProvenanceBadge source={prov} />
            <span>
              {prov === "simulated" ? "Every number here comes from the simulator, not the lab testbed." :
                prov === "capture" ? "Numbers come from real captures." :
                "Simulated and real data are both loaded; each run, cell and chart says which it is."}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-ink-2">
              <span aria-hidden className={`inline-block size-2 rounded-full ${status === "error" ? "bg-danger" : status === "loading" ? "animate-pulse bg-ink-3" : "bg-ok"}`} />
              {status === "error" ? "bundle failed to load · " : null}{bundle ? `bundle ${bundle.schemaVersion} · ${bundle.provenance.commit?.slice(0, 7) ?? "no commit"}` : "bundle loading · ·······"} · {uploads.length} added CSV{uploads.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 pb-16 pt-4 outline-none">
        <div className="mb-4">
          {pinnedRun ? (
            <nav aria-label="Breadcrumb" className="mb-1 text-sm text-ink-3">
              <ol className="flex flex-wrap items-center gap-1">
                <li><a href="#/runs" className="hover-fade inline-flex min-h-11 items-center underline hover:text-ink">Runs</a></li>
                <li aria-hidden><ChevronRightIcon className="size-4" /></li>
                <li>{ROUTE_LABEL[route]}</li>
                <li aria-hidden><ChevronRightIcon className="size-4" /></li>
                <li aria-current="page" className="truncate font-mono text-ink-2">{pinnedRun.name}</li>
              </ol>
            </nav>
          ) : null}
          <h1 className="text-2xl font-semibold text-ink">{ROUTE_LABEL[route]}</h1>
          <p className="max-w-prose text-sm text-ink-2">{INTRO[route]}</p>
        </div>
        {status === "error" ? (
          <ErrorState title="The data bundle did not load" message={`${error ?? "unknown error"}. Regenerate it with: python -m icmp_detector export-ui --out ui/public/data`} onRetry={retry} />
        ) : status === "loading" && route !== "evidence" && route !== "runs" ? (
          <div className="grid gap-4 md:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div>
        ) : (
          <Suspense fallback={<div className="grid gap-4 md:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div>}>
            <div key={route} className="view-enter"><View /></div>
          </Suspense>
        )}
      </main>
      <footer className="no-print border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-ink-3">
          <span>Cadence · defensive analysis for an authorised closed lab testbed</span>
          <a className="inline-flex min-h-11 items-center underline" href="#/evidence">About this project</a>
        </div>
      </footer>
    </>
  );
}
