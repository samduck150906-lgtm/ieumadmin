import { ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variants = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-button focus:ring-brand-500',
  secondary:
    'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 active:bg-neutral-300 focus:ring-neutral-400',
  outline:
    'border-[1.5px] border-brand-600 text-brand-600 hover:bg-brand-50 active:bg-brand-100 focus:ring-brand-500',
  ghost:
    'text-brand-600 hover:bg-brand-50 active:bg-brand-100 focus:ring-brand-500',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm focus:ring-red-500',
  success:
    'bg-green-600 text-white hover:bg-green-700 active:bg-green-800 shadow-sm focus:ring-green-500',
};

const sizes = {
  sm: 'min-h-[44px] h-11 px-4 text-sm rounded-xl tracking-tight',
  md: 'min-h-[44px] h-11 px-5 text-sm rounded-xl tracking-tight',
  lg: 'min-h-[44px] h-12 px-7 text-base rounded-2xl tracking-tight',
  xl: 'px-8 py-4 text-base sm:text-lg rounded-2xl min-h-[56px] tracking-tight',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading,
      leftIcon,
      rightIcon,
      fullWidth,
      children,
      disabled,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.97]',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
      {!isLoading && leftIcon && <span className="mr-2 [&>svg]:h-4 [&>svg]:w-4">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span className="ml-2 [&>svg]:h-4 [&>svg]:w-4">{rightIcon}</span>}
    </button>
  )
);

Button.displayName = 'Button';
export { Button };
