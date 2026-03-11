/**
 * className 유틸 — clsx + tailwind-merge
 * 패키지 미설치 시 단순 결합으로 동작
 */

type ClassValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | ClassValue[];

function clsx(...inputs: ClassValue[]): string {
  return inputs
    .flat()
    .filter((x) => x != null && typeof x !== 'boolean')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tailwind 클래스 충돌 시 나중 것 우선 (간단 버전) */
function twMerge(classNames: string): string {
  const groups = new Map<string, string>();
  const order = [
    'block',
    'flex',
    'inline',
    'grid',
    'hidden',
    'w-',
    'h-',
    'min-',
    'max-',
    'p-',
    'px-',
    'py-',
    'm-',
    'mx-',
    'my-',
    'gap-',
    'text-',
    'font-',
    'bg-',
    'border',
    'rounded',
    'shadow',
    'opacity',
    'transition',
    'focus:',
    'hover:',
    'active:',
    'disabled:',
  ];
  for (const c of classNames.split(/\s+/)) {
    if (!c) continue;
    const key = order.find((p) => c.startsWith(p)) ?? c;
    groups.set(key, c);
  }
  return Array.from(groups.values()).join(' ');
}

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs));
}
