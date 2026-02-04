'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, X } from '@phosphor-icons/react';
import FilterDropdown from './FilterDropdown';

export default function FilterPanel({ filters, onFiltersChange, filterConfig }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleFilterChange = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="relative">
      {/* Filter Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 border border-white/10 hover:border-white/20 rounded-lg text-white transition-all"
      >
        <SlidersHorizontal size={16} />
        <span className="text-xs font-medium">Filters</span>
        {isOpen && <X size={14} />}
      </button>

      {/* Filter Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full mt-2 left-0 bg-zinc-900 border border-white/10 rounded-lg shadow-2xl p-4 z-50 w-max"
            >
              <div className="space-y-3">
                {filterConfig.map((config) => (
                  <div key={config.key} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400 min-w-[60px]">{config.label}</span>
                    <FilterDropdown
                      label={config.label}
                      options={config.options}
                      value={filters[config.key] || (config.multiple ? [] : '')}
                      onChange={(val) => handleFilterChange(config.key, val)}
                      multiple={config.multiple}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
