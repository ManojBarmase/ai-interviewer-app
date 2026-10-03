"use client";

/**
 * @file Card.tsx
 * @description Flexible content container with optional interactive states.
 *
 * The Card is composed of four sub-components for maximum flexibility:
 *   <Card>         — Root container (div or article based on `as` prop)
 *   <CardHeader>   — Top section, typically contains title + description
 *   <CardBody>     — Main content area with consistent padding
 *   <CardFooter>   — Bottom section, typically contains actions
 *
 * Variants:  default | outlined | elevated | ghost
 * Sizes:     sm | md | lg  (controls internal padding)
 *
 * Interactive mode:
 *   When `isInteractive` is true, the card receives hover/focus styles and
 *   becomes keyboard-navigable. Use this for clickable card lists.
 *
 * WCAG compliance:
 * - Interactive cards use role="button" + tabIndex=0 + onKeyDown for
 *   keyboard activation (Enter / Space)
 * - Non-interactive cards are semantically neutral divs (or `article`)
 * - `aria-label` / `aria-labelledby` supported on the root
 * - Color contrast maintained across light and dark mode via CSS tokens
 */

import {
  forwardRef,
  useCallback,
  type ElementType,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardVariant = "default" | "outlined" | "elevated" | "ghost";
export type CardSize = "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual style variant. Default: "default". */
  variant?: CardVariant;
  /** Controls internal padding of Card sub-components. Default: "md". */
  size?: CardSize;
  /**
   * When true, adds hover/focus/active states and keyboard navigation.
   * Pass `onClick` to handle the interaction.
   */
  isInteractive?: boolean;
  /**
   * HTML element to render. Use "article" for self-contained content,
   * "section" for thematic groupings, "div" for generic containers.
   * Default: "div".
   */
  as?: ElementType;
  children: ReactNode;
}

// ── Style maps ────────────────────────────────────────────────────────────────

const variantStyles: Record<CardVariant, string> = {
  default:
    "bg-surface border border-border shadow-[--shadow-sm]",
  outlined:
    "bg-background border border-border shadow-none",
  elevated:
    "bg-surface border border-border shadow-[--shadow-md]",
  ghost:
    "bg-transparent border border-transparent shadow-none",
};

const interactiveStyles =
  "cursor-pointer transition-all duration-[--transition-base] " +
  "hover:shadow-[--shadow-md] hover:border-border-strong hover:-translate-y-0.5 " +
  "active:translate-y-0 active:shadow-[--shadow-sm] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// ── Card (root) ───────────────────────────────────────────────────────────────

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "default",
      size: _size = "md",
      isInteractive = false,
      as: Component = "div",
      onClick,
      onKeyDown,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    // Keyboard handler — activates card on Enter or Space
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (isInteractive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.(e as unknown as MouseEvent<HTMLDivElement>);
        }
        onKeyDown?.(e);
      },
      [isInteractive, onClick, onKeyDown]
    );

    return (
      <Component
        ref={ref}
        // Interactive cards need tab focus and role="button" for a11y.
        // Non-interactive cards are neutral containers.
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={isInteractive ? handleKeyDown : onKeyDown}
        onClick={onClick}
        className={[
          "rounded-[--radius-xl] overflow-hidden",
          variantStyles[variant],
          isInteractive && interactiveStyles,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </Component>
    );
  }
);

Card.displayName = "Card";

// ── CardHeader ────────────────────────────────────────────────────────────────

const headerPadding: Record<CardSize, string> = {
  sm: "px-4 pt-4 pb-3",
  md: "px-6 pt-6 pb-4",
  lg: "px-8 pt-8 pb-5",
};

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  size?: CardSize;
  /**
   * Optional decorative element (icon, avatar, badge) rendered before
   * the title. Always mark these as aria-hidden.
   */
  leadingElement?: ReactNode;
  /**
   * Primary heading for the card. Renamed to `cardTitle` to avoid the
   * `title: string` conflict in HTMLAttributes (which is a tooltip string).
   */
  cardTitle?: ReactNode;
  /** Supporting description text. */
  cardDescription?: ReactNode;
}

export function CardHeader({
  size = "md",
  leadingElement,
  cardTitle,
  cardDescription,
  className,
  children,
  ...rest
}: CardHeaderProps) {
  return (
    <div
      className={[
        "flex items-start gap-4",
        headerPadding[size],
        "border-b border-border",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {leadingElement !== undefined && (
        <div aria-hidden="true" className="shrink-0 mt-0.5">
          {leadingElement}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {cardTitle !== undefined && (
          <div className="text-text-primary font-semibold leading-tight truncate">
            {cardTitle}
          </div>
        )}
        {cardDescription !== undefined && (
          <p className="mt-1 text-sm text-text-secondary leading-relaxed">
            {cardDescription}
          </p>
        )}
        {/* Slot for arbitrary header content */}
        {children}
      </div>
    </div>
  );
}

// ── CardBody ──────────────────────────────────────────────────────────────────

const bodyPadding: Record<CardSize, string> = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  size?: CardSize;
}

export function CardBody({
  size = "md",
  className,
  children,
  ...rest
}: CardBodyProps) {
  return (
    <div
      className={[bodyPadding[size], "text-text-secondary", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

// ── CardFooter ────────────────────────────────────────────────────────────────

const footerPadding: Record<CardSize, string> = {
  sm: "px-4 pt-3 pb-4",
  md: "px-6 pt-4 pb-6",
  lg: "px-8 pt-5 pb-8",
};

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  size?: CardSize;
  /** When true, renders items with space-between (left + right groups). */
  spread?: boolean;
}

export function CardFooter({
  size = "md",
  spread = false,
  className,
  children,
  ...rest
}: CardFooterProps) {
  return (
    <div
      className={[
        "flex flex-wrap items-center gap-3",
        spread ? "justify-between" : "justify-end",
        footerPadding[size],
        "border-t border-border",
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
