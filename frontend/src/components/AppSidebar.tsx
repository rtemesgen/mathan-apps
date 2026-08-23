import type { ReactNode } from 'react';

export function AppSidebar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <aside className={`erp-sidebar ${className}`}>{children}</aside>;
}
