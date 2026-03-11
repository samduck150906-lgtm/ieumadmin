'use client';

import { useCallback, useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  'aria-label'?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = '검색',
  debounceMs = 300,
  className,
  'aria-label': ariaLabel = '검색',
}: SearchInputProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [local, debounceMs, onChange, value]);

  const handleClear = useCallback(() => {
    setLocal('');
    onChange('');
  }, [onChange]);

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden
      />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-10 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
      {local && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="검색어 지우기"
        >
          <span className="text-xs">✕</span>
        </button>
      )}
    </div>
  );
}
