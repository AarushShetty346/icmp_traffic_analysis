import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: ReactNode;
  loading?: boolean;
}

const styles: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90 border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-bg",
};

/** Every button is at least 44px tall so it is an easy tap target. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, loading, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md font-medium transition-colors duration-[var(--dur-fast)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "px-4 text-sm" : "min-w-11 px-3 text-sm",
        styles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : icon}
      {children}
    </button>
  );
});
