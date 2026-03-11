'use client';

import { useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: ReactNode;
  footer?: ReactNode;
  closeOnOverlayClick?: boolean;
}

const sizeClasses = {
  sm: 'max-w-[calc(100vw-2rem)] sm:max-w-sm',
  md: 'max-w-[calc(100vw-2rem)] sm:max-w-md',
  lg: 'max-w-[calc(100vw-2rem)] sm:max-w-lg',
  xl: 'max-w-[calc(100vw-2rem)] sm:max-w-xl',
  full: 'max-w-[95vw] sm:max-w-[90vw] max-h-[90vh]',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  closeOnOverlayClick = true,
}: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen || typeof document === 'undefined') return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-desc' : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bottom-sheet"
    >
      <div
        className="fixed inset-0 bg-black/50 animate-overlay-in transition-opacity duration-200"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative w-full rounded-2xl sm:rounded-modal bg-white shadow-modal animate-scale-in duration-200',
          sizeClasses[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1 mr-3">
            <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-neutral-900 truncate">
              {title}
            </h2>
            {description && (
              <p id="modal-desc" className="mt-1 text-sm text-neutral-500 line-clamp-2">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 focus:ring-2 focus:ring-brand-500 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[65vh] sm:max-h-[70vh] overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 overscroll-contain">{children}</div>
        {footer && (
          <div className="border-t border-neutral-200 px-4 py-3 sm:px-6 sm:py-4">{footer}</div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
