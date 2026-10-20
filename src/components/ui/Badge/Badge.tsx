'use client';

/**
 * @file Badge.tsx
 * @description Accessible status badge and tag primitive.
 *
 * Variants: default | primary | success | warning | danger | neutral
 * Sizes:    sm | md | lg
 *
 * WCAG 2.1 AA Compliance:
 * - High contrast text vs background ratios
 * - Screen-reader status role support
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export type BadgeVariant =
  'default' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  hasDot?: boolean;
  leadingIcon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<BadgeVariant, { badge: string; dot: string }> = {
  default: {
    badge: 'bg-white/10 text-white/80 border-white/15',
    dot: 'bg-white/60',
  },
  primary: {
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-400',
  },
  success: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  warning: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  danger: {
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    dot: 'bg-red-400',
  },
  neutral: {
    badge: 'bg-white/5 text-white/60 border-white/10',
    dot: 'bg-white/40',
  },
};

const sizeStyles: Record<BadgeSize, { badge: string; dot: string }> = {
  sm: {
    badge: 'px-2 py-0.5 text-[11px] gap-1',
    dot: 'w-1.5 h-1.5',
  },
  md: {
    badge: 'px-2.5 py-1 text-xs gap-1.5',
    dot: 'w-2 h-2',
  },
  lg: {
    badge: 'px-3 py-1.5 text-sm gap-2',
    dot: 'w-2.5 h-2.5',
  },
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    variant = 'default',
    size = 'md',
    hasDot = false,
    leadingIcon,
    children,
    className = '',
    ...props
  },
  ref,
) {
  const vStyle = variantStyles[variant];
  const sStyle = sizeStyles[size];

  return (
    <span
      ref={ref}
      className={[
        'inline-flex items-center justify-center font-medium rounded-full border tracking-wide transition-colors',
        vStyle.badge,
        sStyle.badge,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {hasDot && (
        <span
          className={['rounded-full shrink-0', vStyle.dot, sStyle.dot].join(
            ' ',
          )}
          aria-hidden="true"
        />
      )}
      {leadingIcon && (
        <span className="shrink-0 flex items-center" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
});

Badge.displayName = 'Badge';
