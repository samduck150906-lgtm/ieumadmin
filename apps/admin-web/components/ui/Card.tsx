'use client';

import { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
  index?: number;
};

export function Card({
  children,
  className = '',
  interactive = false,
  onClick,
}: CardProps) {
  const Component = onClick ? 'button' : 'div';
  const isInteractive = interactive || Boolean(onClick);

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`
        bg-white rounded-2xl border border-neutral-200/60 shadow-card overflow-hidden
        transition-all duration-200 ease-in-out
        ${isInteractive ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.99]' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-4 py-4 sm:px-6 sm:py-5 lg:px-8 border-b border-neutral-200/60 flex flex-col sm:flex-row sm:items-center ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-4 py-4 sm:px-6 sm:py-5 lg:p-8 ${className}`}>{children}</div>;
}
