'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';
import FilterDropdown from './FilterDropdown';
import clsx from 'clsx';

export default function FilterPanel({ filters, onFiltersChange, filterConfig }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleFilterChange = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const activeCount = filterConfig.reduce((acc, config) => {
    const value = filters[config.key];
    return acc + (config.multiple ? (value?.length || 0) : (value ? 1 : 0));
  }, 0);

  return (
    <div className="relative font-thinking z-40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200",
          activeCount > 0
            ? "bg-white text-black border-white shadow-lg shadow-white/10"
            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
        )}
      >
        <SlidersHorizontal size={16} />
        <span className="text-sm font-bold">Filters</span>
        {activeCount > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 bg-black text-white rounded-full text-[10px] font-bold px-1.5">
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40 bg-transparent" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", bounce: 0, duration: 0.2 }}
              className="absolute right-0 top-full mt-3 p-4 bg-[#0E0E0E] border border-zinc-800 rounded-2xl shadow-2xl z-50 w-[300px] ring-1 ring-white/5"
            >
              <div className="flex items-center justify-between mb-4 px-1">
                 <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-white">Active Filters</h3>
                    {activeCount > 0 && (
                        <button 
                            onClick={() => {
                                const newFilters = { ...filters };
                                filterConfig.forEach(config => {
                                    newFilters[config.key] = config.multiple ? [] : '';
                                });
                                onFiltersChange(newFilters);
                            }}
                            className="text-xs font-semibold text-zinc-500 hover:text-white transition-colors"
                        >
                            Reset
                        </button>
                    )}
                 </div>
                 <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition-colors"
                >
                   <X size={16} strokeWidth={2.5} />
                 </button>
              </div>
              
              <div className="space-y-4">
                {filterConfig.map((config) => (
                  <div key={config.key}>
                    <p className="text-xs font-bold text-zinc-500 mb-2 ml-1 uppercase tracking-wider">{config.label}</p>
                    <FilterDropdown
                      label={`All ${config.label}`}
                      options={config.options}
                      value={filters[config.key]}
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
