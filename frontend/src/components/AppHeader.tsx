import type { ReactNode } from 'react';

export function AppHeader({ children, className = '', bare = false }: { children: ReactNode; className?: string; bare?: boolean }) {
  const shell = `erp-header native-safe-top sticky top-0 z-40 border-b px-4 py-2.5 backdrop-blur sm:px-5 ${className}`;
  return bare ? <header className={shell}>{children}</header> : <header className={shell}><div className="mx-auto flex max-w-7xl items-center justify-between gap-3">{children}</div></header>;
}
