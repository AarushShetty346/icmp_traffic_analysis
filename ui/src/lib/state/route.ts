// Hash routing with URL-encoded view state: #/signal?run=abc&w=32. Every view is a shareable link.
import { useCallback, useSyncExternalStore } from "react";

export const ROUTES = ["runs", "signal", "detectors", "stress", "decode", "evidence"] as const;
export type Route = (typeof ROUTES)[number];

export const ROUTE_LABEL: Record<Route, string> = {
  runs: "Runs",
  signal: "Signal",
  detectors: "Detectors",
  stress: "Stress matrix",
  decode: "Decode",
  evidence: "Evidence",
};

export function parseHash(hash: string): { route: Route; params: URLSearchParams } {
  const raw = hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const route = (ROUTES as readonly string[]).includes(path) ? (path as Route) : "runs";
  return { route, params: new URLSearchParams(query) };
}

export function buildHash(route: Route, params: URLSearchParams | Record<string, string | null | undefined>): string {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "") as [string, string][]);
  const q = p.toString();
  return `#/${route}${q ? `?${q}` : ""}`;
}

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const { route, params } = parseHash(hash);
  const navigate = useCallback((to: Route, next: Record<string, string | null | undefined> = {}) => {
    window.location.hash = buildHash(to, next);
  }, []);
  /** Change one or more params of the current view without adding history entries. */
  const setParams = useCallback((patch: Record<string, string | number | boolean | null | undefined>) => {
    const cur = parseHash(window.location.hash);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === "") cur.params.delete(k);
      else cur.params.set(k, String(v));
    }
    history.replaceState(null, "", buildHash(cur.route, cur.params));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);
  return { route, params, navigate, setParams };
}

/** Read a numeric URL param with a default and bounds. */
export function numParam(params: URLSearchParams, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
