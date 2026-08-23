import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-[#54623E] text-white hover:bg-[#455231]',
  secondary: 'border border-[#E5DFD2] bg-white text-[#1C1D1F] hover:bg-[#EDF2E7]',
  danger: 'bg-[#B42318] text-white hover:bg-[#8f1d14]',
  ghost: 'text-[#787672] hover:bg-[#EDF2E7]',
};

export function AppButton({ children, variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: Variant }) {
  return <button {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[11px] px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}>{children}</button>;
}
