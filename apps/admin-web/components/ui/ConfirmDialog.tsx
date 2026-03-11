'use client';

import { useState, useCallback, type ReactNode } from 'react';
import Modal from './Modal';
import { cn } from '@/utils/cn';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
  requireTyping?: string;
  children?: ReactNode;
}

const variantStyles = {
  danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  info: 'bg-brand-600 hover:bg-brand-700 focus:ring-brand-500',
};

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'info',
  isLoading = false,
  requireTyping,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const canConfirm = !requireTyping || typed === requireTyping;

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || isLoading) return;
    await onConfirm();
    setTyped('');
  }, [canConfirm, isLoading, onConfirm]);

  const handleClose = useCallback(() => {
    setTyped('');
    onClose();
  }, [onClose]);

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={handleClose}
        disabled={isLoading}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {cancelText}
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm || isLoading}
        className={cn(
          'rounded-lg px-4 py-2 text-sm font-medium text-white focus:ring-2 focus:ring-offset-2 disabled:opacity-50',
          variantStyles[variant]
        )}
      >
        {isLoading ? '처리 중...' : confirmText}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={description}
      size="sm"
      footer={footer}
      closeOnOverlayClick={!isLoading}
    >
      {children}
      {requireTyping && (
        <div className="mt-4">
          <label htmlFor="confirm-typing" className="block text-sm text-gray-600">
            확인하려면 &quot;{requireTyping}&quot; 입력
          </label>
          <input
            id="confirm-typing"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            placeholder={requireTyping}
            aria-required="true"
          />
        </div>
      )}
    </Modal>
  );
}
