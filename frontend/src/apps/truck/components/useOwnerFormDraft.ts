import { useEffect, useState } from 'react';
import type { Owner } from '../types';

export type OwnerFormDraft = {
  name: string;
  startDate: string;
  equityPercentage: string;
  monthlyDrawRate: string;
};

const today = () => new Date().toISOString().split('T')[0];

function draftFromOwner(owner?: Owner | null): OwnerFormDraft {
  return owner
    ? { name: owner.name, startDate: owner.startDate || today(), equityPercentage: String(owner.equityPercentage), monthlyDrawRate: String(owner.monthlyDrawRate) }
    : { name: '', startDate: today(), equityPercentage: '', monthlyDrawRate: '' };
}

export function useOwnerFormDraft(editingOwner?: Owner | null, resetKey?: string | boolean) {
  const [draft, setDraft] = useState<OwnerFormDraft>(() => draftFromOwner(editingOwner));

  useEffect(() => {
    setDraft(draftFromOwner(editingOwner));
  }, [editingOwner, resetKey]);

  const setField = <T extends keyof OwnerFormDraft>(field: T, value: OwnerFormDraft[T]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return { draft, setDraft, setField };
}
