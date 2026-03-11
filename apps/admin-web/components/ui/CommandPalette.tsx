'use client';

/**
 * Command Palette — Enterprise Admin (⌘K / Ctrl+K)
 * Premium Korean SaaS: Toss/Notion 스타일 빠른 검색·이동
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Users,
  Wallet,
  Search,
  ArrowRight,
} from 'lucide-react';

type CommandItem = {
  id: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  shortcut?: string;
};

const defaultCommands: CommandItem[] = [
  { id: 'dashboard', label: '대시보드', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'requests', label: '서비스 요청', href: '/requests', icon: <FileText className="h-4 w-4" /> },
  { id: 'realtors', label: '공인중개사', href: '/members/realtors', icon: <Users className="h-4 w-4" /> },
  { id: 'settlements', label: '정산 관리', href: '/settlements', icon: <Wallet className="h-4 w-4" /> },
];

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  const filtered = query
    ? defaultCommands.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase())
      )
    : defaultCommands;

  const handleSelect = useCallback(
    (item: CommandItem) => {
      if (item.href) {
        router.push(item.href);
        onClose();
      }
    },
    [router, onClose]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        handleSelect(filtered[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selectedIndex, handleSelect, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-primary/20 backdrop-blur-sm transition-opacity duration-250 ease-in-out"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface rounded-xl border border-primary/20 rounded-2xl shadow-card overflow-hidden transition-all duration-250 ease-in-out"
      >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/20">
            <Search className="h-4 w-4 text-text-secondary" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="메뉴 검색 (예: 대시보드, 요청)"
              className="flex-1 text-base outline-none placeholder:text-text-secondary text-text"
              autoFocus
            />
            <kbd className="hidden sm:inline text-xs text-text-secondary px-2 py-0.5 bg-primary/10 rounded">ESC</kbd>
          </div>
          <div className="max-h-64 overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">결과 없음</div>
            ) : (
              filtered.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIndex ? 'bg-primary/12 text-primary-700' : 'hover:bg-primary/8'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1 font-medium">{item.label}</span>
                  <ArrowRight className="h-4 w-4 text-text-secondary" />
                </button>
              ))
            )}
          </div>
      </div>
    </div>
  );
}

/** ⌘K 전역 바인딩 훅 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, setOpen };
}
