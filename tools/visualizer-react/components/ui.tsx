"use client";

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-black text-white hover:bg-[#262626] active:bg-[#333333]",
  secondary:
    "border border-border bg-white text-foreground hover:bg-[#fafafa] active:bg-[#f2f2f2]",
  ghost: "text-[#4d4d4d] hover:bg-[#f2f2f2] hover:text-[#171717]",
  danger: "text-[#d60020] hover:bg-[#ffeef0]",
};

const buttonSizes: Record<ButtonSize, string> = {
  md: "h-10 px-3.5 text-[14px]",
  sm: "h-8 px-3 text-[13px]",
  icon: "h-8 w-8 p-0",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export type SegmentedOption = {
  value: string;
  label: string;
};

export function Segmented({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: SegmentedOption[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-full rounded-md border border-border bg-[#f2f2f2] p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-white text-foreground shadow-[0_1px_1px_rgba(0,0,0,0.04),inset_0_0_0_1px_rgba(0,0,0,0.08)]"
                : "text-[#4d4d4d] hover:text-[#171717]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[12px] font-medium leading-4 text-[#8f8f8f]">
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#d4d4d4] border-t-[#171717]",
        className,
      )}
    />
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn("w-[min(560px,calc(100vw-2rem))]", className)}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-6 tracking-[-0.02em] text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[13px] leading-5 text-[#4d4d4d]">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="-mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[18px] leading-none text-[#8f8f8f] transition-colors hover:bg-[#f2f2f2] hover:text-[#171717]"
        >
          ×
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
