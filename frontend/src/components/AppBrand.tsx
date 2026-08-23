export function AppBrand({ subtitle, compact = false }: { subtitle: string; compact?: boolean }) {
  return <span className={`flex items-center gap-2.5 ${compact ? 'app-brand-compact gap-1.5' : ''}`}>
    <span className={`erp-brand-icon shrink-0 ${compact ? 'app-brand-compact-icon' : ''}`}>M</span>
    <span className="text-left leading-none">
      <span className={`erp-brand-name ${compact ? 'app-brand-compact-name' : ''}`}>Mathan ERP</span>
      <span className={`erp-brand-subtitle mt-1 ${compact ? 'app-brand-compact-subtitle' : ''}`}>{subtitle}</span>
    </span>
  </span>;
}
