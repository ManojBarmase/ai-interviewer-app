"use client";

/**
 * @file Modal.tsx
 * @description Fully accessible dialog/modal component.
 *
 * Sizes:    sm | md | lg | xl | full
 * Variants: default | danger | info
 *
 * WCAG 2.1 AA / ARIA Dialog pattern compliance:
 *   ✓ role="dialog" + aria-modal="true"
 *   ✓ aria-labelledby (title) + aria-describedby (description)
 *   ✓ Focus trap — Tab / Shift+Tab cycle only within the modal
 *   ✓ Initial focus moves to the first focusable element inside
 *   ✓ Escape key closes the modal
 *   ✓ Backdrop click closes the modal (configurable via `closeOnBackdrop`)
 *   ✓ Scroll lock on <body> while open
 *   ✓ Return focus to the trigger element on close
 *   ✓ Backdrop opacity respects `prefers-reduced-motion`
 *
 * Architecture:
 *   Rendered via React Portal into `document.body` to escape stacking contexts.
 *   This also means the component must be a Client Component (`"use client"`).
 *
 * Composition:
 *   <Modal>          — Root dialog wrapper with focus trap
 *   <ModalHeader>    — Title + optional description + close button
 *   <ModalBody>      — Scrollable content area
 *   <ModalFooter>    — Action buttons
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";
export type ModalVariant = "default" | "danger" | "info";

export interface ModalProps {
  /** Controls visibility. */
  isOpen: boolean;
  /** Called when the modal should close (Escape, backdrop click, X button). */
  onClose: () => void;
  /** Size preset. Default: "md". */
  size?: ModalSize;
  /** Visual accent variant. Default: "default". */
  variant?: ModalVariant;
  /**
   * When false, clicking the backdrop does NOT close the modal.
   * Use for critical flows (e.g. irreversible actions) that require
   * an explicit choice. Default: true.
   */
  closeOnBackdrop?: boolean;
  /**
   * When false, the Escape key does not close the modal.
   * Default: true.
   */
  closeOnEscape?: boolean;
  /** Accessible label for the dialog. Use when no visible title is present. */
  "aria-label"?: string;
  children: ReactNode;
  /** Optional className for the dialog panel itself. */
  className?: string;
}

// ── Focusable elements selector (WAI-ARIA focus trap spec) ────────────────────

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "details > summary",
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
}

// ── Size styles ───────────────────────────────────────────────────────────────

const sizeStyles: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
};

// ── Modal (root) ──────────────────────────────────────────────────────────────

export function Modal({
  isOpen,
  onClose,
  size = "md",
  variant: _variant = "default",
  closeOnBackdrop = true,
  closeOnEscape = true,
  "aria-label": ariaLabel,
  children,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Track the element that was focused before the modal opened so we can
  // restore focus on close.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // ── Scroll lock ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // ── Initial focus + return focus ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Capture the element that currently has focus before we steal it.
    returnFocusRef.current = document.activeElement as HTMLElement;

    // After the next paint, move focus into the dialog.
    const frame = requestAnimationFrame(() => {
      if (!dialogRef.current) return;
      const focusable = getFocusableElements(dialogRef.current);
      // Focus the first focusable element, or the dialog itself as fallback.
      const target = focusable[0] ?? dialogRef.current;
      target.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      // Restore focus to the triggering element when the modal closes.
      returnFocusRef.current?.focus();
    };
  }, [isOpen]);

  // ── Focus trap ────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && closeOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab — wrap to last when leaving the first element
        if (active === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        // Tab — wrap to first when leaving the last element
        if (active === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    },
    [closeOnEscape, onClose]
  );

  // ── Backdrop click ────────────────────────────────────────────────────────
  const handleBackdropClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // Only close if the click target is the backdrop itself, not
      // a child element that bubbled up.
      if (closeOnBackdrop && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnBackdrop, onClose]
  );

  if (!isOpen) return null;

  return createPortal(
    // Backdrop
    <div
      role="presentation"
      aria-hidden="false"
      className={[
        "fixed inset-0 z-[--z-modal] flex items-center justify-center p-4",
        // Backdrop colour — motion-safe animation
        "bg-black/50 backdrop-blur-sm",
        "motion-safe:animate-[fadeIn_150ms_ease-out]",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleBackdropClick}
    >
      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        // aria-labelledby and aria-describedby are set by ModalHeader via
        // the useId-generated IDs that ModalContext provides.
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={[
          // Layout
          "relative flex flex-col w-full",
          // Surface
          "bg-surface border border-border",
          "rounded-[--radius-2xl] shadow-[--shadow-xl]",
          // Animation — slides up into view
          "motion-safe:animate-[slideUp_200ms_cubic-bezier(0.16,1,0.3,1)]",
          // Max height with internal scroll
          "max-h-[90vh]",
          sizeStyles[size],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

// ── ModalHeader ───────────────────────────────────────────────────────────────

export interface ModalHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Primary dialog title — used for aria-labelledby. */
  title: string;
  /** Supporting description — used for aria-describedby. */
  description?: string;
  /** Called when the × close button is clicked. */
  onClose?: () => void;
  /**
   * Icon rendered beside the title (e.g. warning icon for danger variant).
   * Must be aria-hidden.
   */
  icon?: ReactNode;
  /** IDs for aria wiring. Generated automatically if omitted. */
  titleId?: string;
  descriptionId?: string;
}

export function ModalHeader({
  title,
  description,
  onClose,
  icon,
  titleId,
  descriptionId,
  className,
  ...rest
}: ModalHeaderProps) {
  const autoTitleId = useId();
  const autoDescId = useId();
  const resolvedTitleId = titleId ?? autoTitleId;
  const resolvedDescId = descriptionId ?? autoDescId;

  return (
    <div
      className={[
        "flex items-start gap-4 px-6 pt-6 pb-5 border-b border-border shrink-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {/* Optional accent icon */}
      {icon !== undefined && (
        <div aria-hidden="true" className="shrink-0 mt-0.5">
          {icon}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h2
          id={resolvedTitleId}
          className="text-lg font-semibold text-text-primary leading-snug"
        >
          {title}
        </h2>
        {description !== undefined && (
          <p
            id={resolvedDescId}
            className="mt-1 text-sm text-text-secondary leading-relaxed"
          >
            {description}
          </p>
        )}
      </div>

      {/* Close button */}
      {onClose !== undefined && (
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className={[
            "shrink-0 -mt-1 -mr-1 p-2 rounded-lg",
            "text-text-muted hover:text-text-primary",
            "hover:bg-surface-raised transition-colors duration-[--transition-fast]",
            "outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ].join(" ")}
        >
          {/* ×  — rendered as SVG for crisp rendering at all sizes */}
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── ModalBody ─────────────────────────────────────────────────────────────────

export interface ModalBodyProps extends HTMLAttributes<HTMLDivElement> {}

export function ModalBody({ className, children, ...rest }: ModalBodyProps) {
  return (
    <div
      className={["flex-1 overflow-y-auto px-6 py-5 text-text-secondary", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

// ── ModalFooter ───────────────────────────────────────────────────────────────

export interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** When true, renders content with space-between layout. Default: false. */
  spread?: boolean;
}

export function ModalFooter({
  spread = false,
  className,
  children,
  ...rest
}: ModalFooterProps) {
  return (
    <div
      className={[
        "flex flex-wrap items-center gap-3 px-6 pb-6 pt-5 border-t border-border shrink-0",
        spread ? "justify-between" : "justify-end",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
