"use client";

import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RatingSliderProps {
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export default function RatingSlider({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 0.5,
  className,
}: RatingSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("relative flex items-center w-32", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full focus:outline-none",
          // Webkit thumb
          "[&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:h-3.5",
          "[&::-webkit-slider-thumb]:w-3.5",
          "[&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:bg-white",
          "[&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.3)]",
          "[&::-webkit-slider-thumb]:transition-transform",
          "[&::-webkit-slider-thumb]:hover:scale-110",
          
          // Mozilla thumb
          "[&::-moz-range-thumb]:h-3.5",
          "[&::-moz-range-thumb]:w-3.5",
          "[&::-moz-range-thumb]:appearance-none",
          "[&::-moz-range-thumb]:border-none",
          "[&::-moz-range-thumb]:rounded-full",
          "[&::-moz-range-thumb]:bg-white",
          "[&::-moz-range-thumb]:transition-transform",
          "[&::-moz-range-thumb]:hover:scale-110"
        )}
        style={{
          background: `linear-gradient(to right, #fbbf24 0%, #fbbf24 ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`,
        }}
      />
    </div>
  );
}
