'use client';
import { useState, useRef, useEffect } from 'react';
import { CaretDown, X } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FilterDropdown({ label, options, value, onChange, multiple = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option) => {
    if (multiple) {
      const currentValue = value || [];
      const newValue = currentValue.includes(option)
        ? currentValue.filter(v => v !== option)
        : [...currentValue, option];
      onChange(newValue);
    } else {
      onChange(option);
      setIsOpen(false);
    }
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onChange(multiple ? [] : '');
  };

  const displayValue = () => {
    if (multiple) {
      if (!value || value.length === 0) return label;
      const selected = options.filter(opt => value.includes(opt.value));
      return selected.length === 1 ? selected[0].label : `${label}: ${selected.length}`;
    }
    const selected = options.find(opt => opt.value === value);
    return selected ? selected.label : label;
  };

  const hasValue = multiple ? value?.length > 0 : value;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg
          bg-zinc-900/50 border transition-all
          ${hasValue ? 'border-white/20 text-white' : 'border-white/10 text-zinc-400'}
          hover:border-white/30 hover:bg-zinc-900/70
          text-xs font-medium min-w-[100px]
        `}
      >
        <span className="truncate">{displayValue()}</span>
        <div className="flex items-center gap-0.5">
          {hasValue && (
            <X 
              size={12} 
              onClick={clearSelection}
              className="hover:text-white"
            />
          )}
          <ChevronDown 
            size={14} 
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full min-w-[160px] bg-zinc-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden"
          >
            <div className="max-h-[280px] overflow-y-auto">
              {options.map((option) => {
                const isSelected = multiple 
                  ? (value || []).includes(option.value)
                  : value === option.value;

                return (
                  <button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`
                      w-full px-3 py-1.5 text-left text-xs transition-colors
                      ${isSelected 
                        ? 'bg-white/10 text-white font-medium' 
                        : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                      }
                    `}
                  >
                    {option.label}
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
