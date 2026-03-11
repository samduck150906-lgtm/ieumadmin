'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id: idProp, ...props }, ref) => {
    const id = idProp ?? `input-${Math.random().toString(36).slice(2, 9)}`;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="mb-1.5 block text-sm font-medium text-neutral-600 tracking-tight"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            'block w-full rounded-xl border-[1.5px] bg-white px-4 py-2.5 text-base sm:text-sm text-neutral-900 transition-all duration-150 min-h-[44px]',
            'placeholder:text-neutral-400',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15 bg-red-50/40'
              : 'border-neutral-200 focus:border-brand-500 focus:ring-brand-500/15 focus:bg-brand-50/30',
            className
          )}
          {...props}
        />
        {error && (
          <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-neutral-400">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
