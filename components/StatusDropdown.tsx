"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Monitor, Check, ChevronDown } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Status = "To Watch" | "Watching" | "Watched" | null;

interface StatusDropdownProps {
  selectedStatus: string | null;
  onStatusChange: (status: string) => void;
}

const statusConfig = {
  "To Watch": { icon: Plus, label: "To Watch", color: "text-blue-400" },
  Watching: { icon: Monitor, label: "Watching", color: "text-green-400" },
  Watched: { icon: Check, label: "Watched", color: "text-purple-400" },
};

export default function StatusDropdown({
  selectedStatus,
  onStatusChange,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentConfig = selectedStatus
    ? statusConfig[selectedStatus as keyof typeof statusConfig]
    : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20",
          "text-gray-200 hover:text-white active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        )}
      >
        {currentConfig ? (
          <>
            <currentConfig.icon className={cn("w-4 h-4", currentConfig.color)} />
            <span>{currentConfig.label}</span>
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 text-gray-400" />
            <span>Add to List</span>
          </>
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 ml-1 text-gray-500 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#1A1A1A] p-1 shadow-xl backdrop-blur-xl"
          >
            {Object.entries(statusConfig).map(([key, config]) => {
              const Icon = config.icon;
              const isSelected = selectedStatus === key;

              return (
                <button
                  key={key}
                  onClick={() => {
                    onStatusChange(key);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isSelected
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4",
                      isSelected ? config.color : "text-gray-500"
                    )}
                  />
                  <span className="flex-1 text-left">{config.label}</span>
                  {isSelected && (
                    <motion.div
                      layoutId="check"
                      className="w-1.5 h-1.5 rounded-full bg-current"
                    />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
