import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bundleSchema, type Bundle } from "./schema";
import { fromBundle, fromUpload, type Run } from "./runs";
import type { ParsedCapture } from "./csv";

type Status = "loading" | "ready" | "error";

interface DataState {
  status: Status;
  error: string | null;
  bundle: Bundle | null;
  runs: Run[];
  uploads: Run[];
  uploadErrors: { name: string; error: string }[];
  parsing: boolean;
  addFiles: (files: File[]) => void;
  updateUpload: (id: string, patch: Partial<Run>) => void;
  removeUpload: (id: string) => void;
  retry: () => void;
  bundleUrl: string;
}

const Ctx = createContext<DataState | null>(null);
export const BUNDLE_URL = `${import.meta.env.BASE_URL}data/bundle.json`;

type WorkerReply = { id: number; results: ({ ok: true; value: ParsedCapture } | { ok: false; name: string; error: string })[] };

export function DataProvider({ children, initial }: { children: ReactNode; initial?: Bundle }) {
  const [status, setStatus] = useState<Status>(initial ? "ready" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(initial ?? null);
  const [uploads, setUploads] = useState<Run[]>([]);
  const [uploadErrors, setUploadErrors] = useState<{ name: string; error: string }[]>([]);
  const [parsing, setParsing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    setStatus("loading");
    fetch(BUNDLE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`could not load ${BUNDLE_URL} (HTTP ${r.status})`);
        return r.json();
      })
      .then((json) => {
        const parsed = bundleSchema.safeParse(json);
        if (!parsed.success) throw new Error(`the data bundle does not match schema 1.x: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
        if (!cancelled) { setBundle(parsed.data); setStatus("ready"); }
      })
      .catch((e: unknown) => {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setStatus("error"); }
      });
    return () => { cancelled = true; };
  }, [attempt, initial]);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    if (!workerRef.current) workerRef.current = new Worker(new URL("../../workers/csv.worker.ts", import.meta.url), { type: "module" });
    const id = ++counter.current;
    setParsing(true);
    const w = workerRef.current;
    const onMessage = (e: MessageEvent<WorkerReply>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      setParsing(false);
      const ok: Run[] = [];
      const bad: { name: string; error: string }[] = [];
      e.data.results.forEach((res, i) => {
        if (res.ok) ok.push(fromUpload(res.value, id * 100 + i));
        else bad.push({ name: res.name, error: res.error });
      });
      setUploads((u) => [...u, ...ok]);
      setUploadErrors(bad);
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, files });
  }, []);

  const updateUpload = useCallback((id: string, patch: Partial<Run>) => setUploads((u) => u.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);
  const removeUpload = useCallback((id: string) => setUploads((u) => u.filter((r) => r.id !== id)), []);
  const runs = useMemo(() => [...uploads, ...(bundle?.runs.map(fromBundle) ?? [])], [bundle, uploads]);

  const value: DataState = {
    status, error, bundle, runs, uploads, uploadErrors, parsing, addFiles, updateUpload, removeUpload,
    retry: () => setAttempt((a) => a + 1), bundleUrl: BUNDLE_URL,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}
