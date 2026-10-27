import { ArrowRightIcon, BookOpenIcon, ChartBarIcon, ClipboardDocumentCheckIcon, LockClosedIcon, ShieldCheckIcon, SignalIcon, TableCellsIcon } from "@heroicons/react/20/solid";
import { lazy, Suspense, useEffect } from "react";
import CaseView from "./views/CaseView";
import { ChartSkeleton, ErrorState } from "./components/ui/States";
import { useData } from "./lib/data/DataContext";
import { ROUTE_LABEL, useRoute, type Route } from "./lib/state/route";
import "./styles/v2.css";
import "./styles/analysis-refinement.css";

const SignalView = lazy(() => import("./views/SignalView"));
const LabView = lazy(() => import("./views/LabView"));
const GuideView = lazy(() => import("./views/GuideView"));
const EvidenceView = lazy(() => import("./views/EvidenceView"));
const RunsView = lazy(() => import("./views/RunsView"));
const DetectorsView = lazy(() => import("./views/DetectorsView"));
const StressView = lazy(() => import("./views/StressView"));
const DecodeView = lazy(() => import("./views/DecodeView"));

const LAB_ROUTES: { route: Route; icon: typeof ChartBarIcon; note: string }[] = [
  { route: "runs", icon: TableCellsIcon, note: "Your recordings" },
  { route: "signal", icon: SignalIcon, note: "Packet gaps" },
  { route: "detectors", icon: ShieldCheckIcon, note: "Alarm rules" },
  { route: "stress", icon: ChartBarIcon, note: "All conditions" },
  { route: "decode", icon: LockClosedIcon, note: "Read the bits" },
];

const ADVANCED = new Set<Route>(LAB_ROUTES.map((x) => x.route));

function View({ route }: { route: Route }) {
  switch (route) {
    case "case": return <CaseView />;
    case "lab": return <LabView />;
    case "guide": return <GuideView />;
    case "runs": return <RunsView />;
    case "signal": return <SignalView />;
    case "detectors": return <DetectorsView />;
    case "stress": return <StressView />;
    case "decode": return <DecodeView />;
    case "evidence": return <EvidenceView />;
  }
}

export default function App() {
  const { route } = useRoute();
  const { status, error, bundle, uploads, retry } = useData();
  const hasCapture = !!bundle?.provenance.hasCapture || uploads.some((u) => u.source === "capture");
  const hasSimulated = !!bundle?.provenance.hasSimulated || uploads.some((u) => u.source === "simulated");
  const hasUnverified = uploads.some((u) => u.source === "unverified");
  const isLabTool = ADVANCED.has(route);

  useEffect(() => { document.title = `${ROUTE_LABEL[route]} | Cadence`; window.scrollTo(0, 0); }, [route]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-ink" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="shell-header no-print">
        <div className="shell-header-inner">
          <a href="#/case" className="shell-brand" aria-label="Cadence, open the guided case">
            <span className="shell-brand-mark" aria-hidden="true"><span /><span /><span /><span /><span /></span>
            <span>Cadence</span>
          </a>
          <nav className="shell-main-nav" aria-label="Main navigation">
            <a href="#/case" aria-current={route === "case" ? "page" : undefined} className={route === "case" ? "active" : ""}>Guided case</a>
            {LAB_ROUTES.map(({ route: r }) => <a key={r} href={`#/${r}`} aria-current={route === r ? "page" : undefined} className={route === r ? "active" : ""}>{ROUTE_LABEL[r]}</a>)}
            <a href="#/guide" aria-current={route === "guide" ? "page" : undefined} className={route === "guide" ? "active" : ""}>Guide</a>
            <a href="#/evidence" aria-current={route === "evidence" ? "page" : undefined} className={route === "evidence" ? "active" : ""}>Evidence</a>
          </nav>
          {route === "lab" ? <a href="#/case" className="shell-start">Guided case <ArrowRightIcon aria-hidden className="size-4" /></a> : null}
        </div>
      </header>
      <div className="shell-data-strip" role="note" aria-label="Data source">
        <span className="shell-data-dot" aria-hidden="true" />
        {hasUnverified ? "UNVERIFIED FILES  ·  Check your imported files and label their source before using their results." : hasCapture ? (hasSimulated ? "Simulated examples and user-labelled captures are loaded. Check each result's source." : "User-labelled captures are loaded. Check their source before drawing conclusions.") : "DEMO DATA  ·  The included recordings are simulated; no real lab captures are included yet."}
      </div>
      <main id="main" tabIndex={-1} className={route === "case" ? "case-main" : "shell-main"}>
        {isLabTool ? <div className="lab-intro"><span>ADVANCED LAB / {ROUTE_LABEL[route].toUpperCase()}</span><h1>{ROUTE_LABEL[route]}</h1><p>{LAB_ROUTES.find((x) => x.route === route)?.note}. <a href="#/guide">New to a term? Open the field guide.</a></p></div> : null}
        {status === "error" && route !== "guide" && route !== "lab" ? <ErrorState title="The example data could not load" message={error ?? "Unknown error"} onRetry={retry} /> :
          status === "loading" && isLabTool && route !== "runs" ? <div className="grid gap-4 md:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div> :
          <Suspense fallback={<div className="grid gap-4 md:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div>}><View route={route} /></Suspense>}
      </main>
      <footer className="shell-footer no-print">
        <div><strong>Cadence</strong><span>ICMP timing-channel analysis and teaching lab</span></div>
        <div><a href="#/lab">Analysis overview</a><a href="#/guide"><BookOpenIcon className="size-4" aria-hidden /> Guide</a><a href="#/evidence"><ClipboardDocumentCheckIcon className="size-4" aria-hidden /> Sources and limits</a></div>
      </footer>
    </>
  );
}
