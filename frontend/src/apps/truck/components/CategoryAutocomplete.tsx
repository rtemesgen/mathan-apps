import React, { useState, useRef, useEffect } from 'react';
import { Tag, Plus, Check, ChevronDown, X } from 'lucide-react';

const DEFAULT_CATEGORIES = [
  'Fuel',
  'Tires & Brakes',
  'Mechanical Repair',
];

const STORAGE_KEY = 'truck_erp_expense_categories';

export function getStoredCategories(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure defaults are included
        const combined = Array.from(new Set([...DEFAULT_CATEGORIES, ...parsed]));
        return combined;
      }
    }
  } catch (e) {
    console.error('Error reading custom categories', e);
  }
  return DEFAULT_CATEGORIES;
}

export function saveStoredCategories(categories: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  } catch (e) {
    console.error('Error saving custom categories', e);
  }
}

interface CategoryAutocompleteProps {
  value: string;
  onChange: (category: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  hasError?: boolean;
}

export const CategoryAutocomplete: React.FC<CategoryAutocompleteProps> = ({
  value,
  onChange,
  placeholder = 'Select or type category (required)...',
  className = '',
  required = false,
  hasError = false,
}) => {
  const [categories, setCategories] = useState<string[]>(getStoredCategories);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsAddingNew(false);
        // If current query has text and differs from value, commit it
        if (query.trim() && query !== value) {
          handleSelectCategory(query.trim());
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [query, value, categories]);

  const handleSelectCategory = (cat: string) => {
    const trimmed = cat.trim();
    if (!trimmed) return;

    if (!categories.includes(trimmed)) {
      const updated = [...categories, trimmed];
      setCategories(updated);
      saveStoredCategories(updated);
    }
    onChange(trimmed);
    setQuery(trimmed);
    setIsOpen(false);
    setIsAddingNew(false);
    setNewCatInput('');
  };

  const handleAddNewCategory = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = newCatInput.trim();
    if (trimmed) {
      handleSelectCategory(trimmed);
    }
  };

  // Filtered list
  const filteredCategories = query.trim()
    ? categories.filter((cat) =>
        cat.toLowerCase().includes(query.toLowerCase().trim())
      )
    : categories;

  const exactMatch = query.trim()
    ? categories.some(
        (cat) => cat.toLowerCase() === query.toLowerCase().trim()
      )
    : true;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input wrapper */}
      <div className="relative flex items-center">
        <Tag className="w-3.5 h-3.5 text-[#787672] absolute left-2.5 pointer-events-none" />
        
        <input
          ref={inputRef}
          type="text"
          required={required}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (query.trim()) {
                handleSelectCategory(query.trim());
              }
            } else if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          className={`w-full bg-[#f8f6f0] border rounded-lg pl-8 pr-14 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none transition-all ${
            hasError
              ? 'border-[#c62828] ring-1 ring-[#c62828]/30'
              : 'border-[#d8d0be] focus:border-[#1c1d1f]'
          }`}
        />

        <div className="absolute right-1.5 flex items-center gap-0.5">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                onChange('');
                inputRef.current?.focus();
                setIsOpen(true);
              }}
              className="p-1 rounded text-[#8c8880] hover:text-[#1c1d1f] transition-colors cursor-pointer"
              title="Clear category"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded text-[#787672] hover:text-[#1c1d1f] transition-colors cursor-pointer"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropdown Suggestions */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#d8d0be] rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto py-1 text-xs animate-in fade-in-50 zoom-in-95 duration-100 divide-y divide-[#f0ebd9]">
          {/* Options List */}
          <div className="py-0.5">
            {filteredCategories.length > 0 ? (
              filteredCategories.map((cat) => {
                const isSelected = value.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelectCategory(cat)}
                    className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[#f5f1e8] transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#f0ebd9] font-bold text-[#1c1d1f]' : 'text-[#4a4843]'
                    }`}
                  >
                    <span>{cat}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#2e7d32]" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-[11px] text-[#787672] italic">
                No matching categories found
              </div>
            )}
          </div>

          {/* Quick Add Custom Typed Category if not already in list */}
          {query.trim() && !exactMatch && (
            <div className="p-1 bg-[#fcfaf6]">
              <button
                type="button"
                onClick={() => handleSelectCategory(query.trim())}
                className="w-full px-2.5 py-1.5 text-left rounded-lg bg-[#e8f5e9] hover:bg-[#c8e6c9] text-[#2e7d32] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Add "{query.trim()}" as new category</span>
              </button>
            </div>
          )}

          {/* "+ Add New Category" inline form toggle */}
          <div className="p-1 bg-[#faf8f5]">
            {!isAddingNew ? (
              <button
                type="button"
                onClick={() => {
                  setIsAddingNew(true);
                  setNewCatInput('');
                }}
                className="w-full px-2.5 py-1.5 text-left rounded-lg text-[#3f4d34] hover:bg-[#f0ebd9] font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add New Custom Category</span>
              </button>
            ) : (
              <div className="p-1.5 space-y-1.5 bg-white border border-[#e5dfd2] rounded-lg">
                <input
                  type="text"
                  autoFocus
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewCategory(e);
                    }
                  }}
                  placeholder="Enter category name..."
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-md px-2 py-1 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="px-2 py-0.5 rounded text-[10px] text-[#787672] hover:bg-[#f0ebd9]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNewCategory}
                    disabled={!newCatInput.trim()}
                    className="px-2.5 py-0.5 rounded bg-[#3f4d34] hover:bg-[#323e29] disabled:opacity-50 text-white font-bold text-[10px] flex items-center gap-1"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
