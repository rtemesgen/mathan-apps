import type { ReactNode } from 'react';

export function AppCard({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={`erp-card ${className}`}>{children}</Tag>;
}
