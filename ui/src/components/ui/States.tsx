import { ExclamationTriangleIcon, InboxIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./cx";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <InboxIcon className="size-8 text-ink-3" aria-hidden />
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="max-w-prose text-sm text-ink-2">{children}</div> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-danger bg-danger-bg p-4">
      <p className="flex items-center gap-2 font-semibold text-danger">
        <ExclamationTriangleIcon className="size-5" aria-hidden /> {title}
      </p>
      <p className="text-sm text-ink">{message}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function Skeleton({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className={cx("skeleton rounded-md", className)}>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div role="status" aria-label="Loading chart" className="flex flex-col gap-2">
      <div className="skeleton rounded-md" style={{ height }} />
      <div className="skeleton h-3 w-1/3 rounded" />
      <span className="sr-only">Loading chart…</span>
    </div>
  );
}
