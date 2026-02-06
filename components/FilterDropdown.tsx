'use client';

import { useState, useRef, useEffect, MouseEvent } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

export interface Option {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  options: Option[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
}

export default function FilterDropdown({ label, options, value, onChange, multiple = false }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: string) => {
    if (multiple) {
      const currentValue = (value as string[]) || [];
      const newValue = currentValue.includes(option)
        ? currentValue.filter(v => v !== option)
        : [...currentValue, option];
      onChange(newValue);
    } else {
      onChange(option);
      setIsOpen(false);
    }
  };

  const clearSelection = (e: MouseEvent) => {
    e.stopPropagation();
    onChange(multiple ? [] : '');
  };

  const displayValue = () => {
    if (multiple) {
      if (!value || (value as string[]).length === 0) return label;
      const valArray = value as string[];
      const selected = options.filter(opt => valArray.includes(opt.value));
      return selected.length === 1 ? selected[0].label : `${label}: ${selected.length}`;
    }
    const selected = options.find(opt => opt.value === value);
    return selected ? selected.label : label;
  };

  const hasValue = multiple ? (value as string[])?.length > 0 : !!value;

  return (
    <div className="relative w-full font-thinking" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border transition-all duration-200",
          hasValue 
            ? "bg-white text-black border-white shadow-lg shadow-white/10" 
            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
        )}
      >
        <span className="truncate text-sm font-semibold">{displayValue()}</span>
        <div className="flex items-center gap-2">
          {hasValue && (
            <div 
              onClick={clearSelection}
              className={clsx(
                "p-0.5 rounded-full transition-colors",
                hasValue ? "hover:bg-black/10" : "hover:bg-white/10"
              )}
            >
              <X size={14} strokeWidth={2.5} />
            </div>
          )}
          <ChevronDown
            size={16}
            className={clsx("transition-transform duration-300", isOpen && 'rotate-180')}
            strokeWidth={2.5}
          />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: "spring", bounce: 0, duration: 0.2 }}
            className="absolute z-50 mt-2 w-full min-w-[220px] bg-[#0E0E0E] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden ring-1 ring-white/5"
          >
            <div className="max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              {options.map((option) => {
                const isSelected = multiple 
                  ? ((value as string[]) || []).includes(option.value)
                  : value === option.value;

                return (
                  <button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={clsx(
                      "w-full px-4 py-3 text-left text-sm font-medium transition-all flex items-center justify-between group",
                      isSelected 
                        ? "bg-white/10 text-white" 
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                    )}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-white"
                      >
                        <Check size={14} strokeWidth={3} />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
