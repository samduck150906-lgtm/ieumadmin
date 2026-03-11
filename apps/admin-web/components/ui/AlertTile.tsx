'use client';

import type { LucideIcon } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

type AlertTileProps = {
  label: string;
  count: number;
  link: string;
  icon: LucideIcon;
  amount?: number;
  pulse?: boolean;
  index?: number;
};

export function AlertTile({
  label,
  count,
  link,
  icon: Icon,
  amount,
  pulse = false,
}: AlertTileProps) {
  return (
    <a
      href={link}
      className={`
        flex items-center justify-between p-3 rounded-xl border transition-colors
        ${pulse
          ? 'border-secondary-200 bg-secondary/15 hover:bg-secondary/25 animate-pulse'
          : 'border-primary/20 hover:bg-primary/10'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            pulse ? 'bg-accent-100' : 'bg-surface'
          }`}
        >
          <Icon
            className={`h-4 w-4 ${pulse ? 'text-secondary-700' : 'text-text-secondary'}`}
            strokeWidth={2}
          />
        </div>
        <div>
          <span className="text-sm font-medium text-text">{label}</span>
          {amount != null && amount > 0 && (
            <div className="text-xs font-semibold text-secondary-700 mt-0.5">
              ₩{amount.toLocaleString()}
            </div>
          )}
        </div>
      </div>
      <StatusBadge label={`${count}건`} variant={pulse ? 'orange' : 'blue'} />
    </a>
  );
}
