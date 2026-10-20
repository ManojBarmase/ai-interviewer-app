'use client';

/**
 * @file Select.tsx
 * @description Accessible, multi-variant form select primitive.
 *
 * Variants: default | filled | error
 * Sizes:    sm | md | lg
 *
 * WCAG 2.1 AA Compliance:
 * - Native select element ensures full keyboard & screen reader support
 * - Visual chevron icon marked aria-hidden
 * - aria-invalid + aria-describedby for errors and helper text
 * - 4.5:1 minimum contrast across themes
 */

import {
  forwardRef,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

import { ChevronDown } from 'lucide-react';

export type SelectSize = 'sm' | 'md' | 'lg';
export type SelectVariant = 'default' | 'filled' | 'error';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'size'
> {
  variant?: SelectVariant;
  size?: SelectSize;
  label?: string;
  helperText?: string;
  error?: string;
  options?: SelectOption[];
  children?: ReactNode;
}

const sizeStyles: Record<
  SelectSize,
  { container: string; select: string; icon: string }
> = {
  sm: {
    container: 'h-8 text-xs',
    select: 'pl-2.5 pr-8 py-1 text-xs',
    icon: 'right-2.5 w-3.5 h-3.5',
  },
  md: {
    container: 'h-10 text-sm',
    select: 'pl-3 pr-10 py-2 text-sm',
    icon: 'right-3 w-4 h-4',
  },
  lg: {
    container: 'h-12 text-base',
    select: 'pl-4 pr-12 py-3 text-base',
    icon: 'right-4 w-5 h-5',
  },
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      variant = 'default',
      size = 'md',
      label,
      helperText,
      error,
      options,
      children,
      id: explicitId,
      className = '',
      disabled,
      required,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const selectId = explicitId || generatedId;
    const helperId = `${selectId}-helper`;
    const errorId = `${selectId}-error`;

    const isError = Boolean(error) || variant === 'error';
    const sizeConfig = sizeStyles[size];

    const borderClass = isError
      ? 'border-red-500/70 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20'
      : 'border-white/10 hover:border-white/20 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30';

    const bgClass = variant === 'filled' ? 'bg-white/[0.03]' : 'bg-[#12131a]';

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-medium text-white/70 select-none flex items-center gap-1"
          >
            {label}
            {required && (
              <span className="text-red-400" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div
          className={[
            'relative flex items-center w-full rounded-lg border transition-all duration-150',
            bgClass,
            borderClass,
            sizeConfig.container,
            disabled ? 'opacity-50 cursor-not-allowed bg-white/[0.02]' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            required={required}
            aria-invalid={isError ? 'true' : undefined}
            aria-describedby={
              [error ? errorId : null, helperText ? helperId : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            className={[
              'w-full h-full appearance-none bg-transparent text-white focus:outline-none cursor-pointer',
              sizeConfig.select,
              disabled ? 'cursor-not-allowed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="bg-[#12131a] text-white"
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <ChevronDown
            className={[
              'absolute pointer-events-none text-white/40',
              sizeConfig.icon,
            ].join(' ')}
            aria-hidden="true"
          />
        </div>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="text-xs text-red-400 font-medium"
          >
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-white/40">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';
