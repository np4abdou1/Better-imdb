'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Film, Star, PlayCircle } from 'lucide-react';
import { searchTitles } from '@/lib/api';
import Link from 'next/link';
import clsx from 'clsx';

const PLACEHOLDERS = ["Find your next favorite show...", "Explore movies and series...", "Search titles, actors, directors...", "What do you want to watch?"];

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [hasTyped, setHasTyped] = useState(false);
  
  // Effects State
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderCharIndex, setPlaceholderCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Mouse Tracking
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Typing Animation
  useEffect(() => {
    const timeout = setTimeout(() => {
      const currentPlaceholder = PLACEHOLDERS[placeholderIndex];
      
      if (!isDeleting && placeholderCharIndex < currentPlaceholder.length) {
        setPlaceholderCharIndex(prev => prev + 1);
      } else if (isDeleting && placeholderCharIndex > 0) {
        setPlaceholderCharIndex(prev => prev - 1);
      } else if (!isDeleting && placeholderCharIndex === currentPlaceholder.length) {
        setTimeout(() => setIsDeleting(true), 2000); // Pause at end
      } else if (isDeleting && placeholderCharIndex === 0) {
        setIsDeleting(false);
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
      }
    }, isDeleting ? 50 : 100);

    return () => clearTimeout(timeout);
  }, [placeholderCharIndex, isDeleting, placeholderIndex]);

  // Search Logic - Instant transition when typing starts
  useEffect(() => {
    // Set hasTyped immediately when user starts typing (no delay)
    setHasTyped(query.length > 0);
    
    // Debounce only the actual search query
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.length > 2) {
      handleSearch(debouncedQuery);
    } else {
      setResults([]);
    }
  }, [debouncedQuery]);

  const handleSearch = async (q) => {
    setLoading(true);
    try {
      const data = await searchTitles(q);
      setResults(data.titles || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoClick = () => {
    setQuery('');
    setHasTyped(false);
    setResults([]);
  };

  return (
    <div className={clsx(
      "min-h-screen w-full flex flex-col items-center relative overflow-hidden text-white",
      hasTyped ? "justify-start pt-8" : "justify-center",
      hasTyped ? "transition-none" : "transition-all duration-700 ease-out"
    )}>
      
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-black">
        {/* Animated Noise/Grain could go here, keeping it simple for now */}
        
        {/* Mouse Spotlight - Made more visible */}
        <div 
          className="absolute inset-0 transition-opacity duration-75 ease-linear"
          style={{
            background: `radial-gradient(1000px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.08), transparent 50%)`
          }}
        />
        
        {/* Subtle Ambient Glows */}
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-white/5 rounded-full blur-[120px] opacity-20 animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-zinc-800/20 rounded-full blur-[100px] opacity-30" />
      </div>

      {/* Floating Lists Icon - Top Right */}
      <AnimatePresence>
        {!hasTyped && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed top-6 right-6 z-50"
          >
            <Link href="/lists">
              <motion.button
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
                className="p-3 cursor-pointer transition-all"
                aria-label="View Lists"
              >
                <Film size={24} className="text-white" />
              </motion.button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Icons - Hidden when not searching to reduce clutter per request */}
      <AnimatePresence>
        {false && ( // Temporarily disabled based on feedback "list page icons are showing" (complaint)
          <motion.div />
        )}
      </AnimatePresence>

      {/* Main Layout Container */}
      <motion.div 
        layout
        transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}
        className={clsx(
          "w-full px-6 flex z-50 items-center relative",
          hasTyped ? "flex-row gap-6 max-w-6xl" : "flex-col gap-12 max-w-2xl"
        )}
      >
         {/* IMDb Logo - Monochrome */}
         <motion.div 
           layout
           onClick={handleLogoClick}
           className="shrink-0 cursor-pointer"
           whileHover={{ scale: 1.05 }}
           whileTap={{ scale: 0.95 }}
         >
           <motion.div 
             layout
             className={clsx(
               "font-black tracking-tighter leading-none select-none border-4 border-white text-white flex items-center justify-center transition-all",
               hasTyped ? "text-3xl px-2 py-0.5 border-2 rounded" : "text-7xl md:text-8xl px-6 py-2 rounded-xl"
             )}
           >
             IMDb
           </motion.div>
         </motion.div>
         
        {/* Search Bar - Premium Underline Design */}
        <motion.div 
          layout
          className={clsx(
            "relative group w-full",
            hasTyped ? "flex-1" : ""
          )}
        >
          <div className="relative">
             {/* Search Icon */}
            <div className={clsx(
              "absolute left-0 flex items-center pointer-events-none transition-all duration-300 z-10",
              hasTyped 
                ? "top-1/2 -translate-y-1/2" 
                : "top-1/2 -translate-y-1/2"
            )}>
              <Search 
                size={hasTyped ? 20 : 24} 
                className="text-zinc-500 group-focus-within:text-white transition-colors duration-300" 
              />
            </div>
            
            {/* Input Container with Underline */}
            <div className="relative">
            <motion.input
              layout
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={clsx(
                  "w-full bg-transparent text-white placeholder-transparent",
                  "focus:outline-none transition-all font-light tracking-wide",
                  "selection:bg-white/20 selection:text-white",
                  "border-b transition-colors duration-300",
                hasTyped 
                    ? "pl-8 pr-4 py-2.5 text-lg border-white/20 focus:border-white" 
                    : "pl-12 pr-4 py-4 text-xl md:text-2xl border-b-2 border-white/20 focus:border-white"
              )}
              autoFocus
            />

              {/* Custom Placeholder - Fixed positioning to prevent stretch */}
            {!query && (
                <div 
                  className={clsx(
                    "absolute left-0 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-zinc-500 font-light select-none",
                    "overflow-hidden",
                    hasTyped 
                      ? "pl-8 text-lg" 
                      : "pl-12 text-xl md:text-2xl"
                  )}
                >
                  <span className="inline-flex items-center">
                    <span className="inline-block whitespace-nowrap">
                   {PLACEHOLDERS[placeholderIndex].substring(0, placeholderCharIndex)}
                    </span>
                    <span 
                      className={clsx(
                        "inline-block ml-1.5 bg-zinc-500",
                        hasTyped ? "w-0.5 h-4" : "w-0.5 h-5"
                      )}
                      style={{
                        animation: 'blink 1s infinite'
                      }}
                    />
                 </span>
               </div>
            )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Results Grid - Enhanced */}
      <div className="w-full max-w-[1920px] px-6 mt-12 pb-20 relative z-10">
        {hasTyped && results.length > 0 && (
          <div className="mb-6 text-zinc-400 text-sm">
            Found {results.length} {results.length === 1 ? 'result' : 'results'} for &quot;{query}&quot;
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 w-full">
          <AnimatePresence mode="popLayout">
            {results.map((title, index) => (
              <motion.div
                key={title.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, delay: index * 0.03 }}
                layout
              >
                <Link href={`/title/${title.id}`} className="group block relative rounded-xl overflow-hidden aspect-[2/3] bg-zinc-900/50 border border-white/10 hover:border-white hover:ring-2 hover:ring-white transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl">
                  {title.primaryImage ? (
                    <img 
                      src={title.primaryImage.url} 
                      alt={title.primaryTitle}
                      loading="lazy"
                      className="w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-zinc-900/80">
                      <Film size={48} className="mb-2 opacity-50" />
                      <span className="text-xs">No Image</span>
                    </div>
                  )}
                  
                  {/* Info Overlay - Enhanced */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <h3 className="font-bold text-base text-white leading-tight mb-2 line-clamp-2">
                      {title.primaryTitle}
                    </h3>
                    
                    <div className="flex items-center gap-3 text-xs font-medium text-zinc-300">
                      {title.startYear && <span>{title.startYear}</span>}
                      {title.rating && (
                        <div className="flex items-center gap-1 text-white">
                          <Star size={12} fill="currentColor" />
                          <span className="font-semibold">{title.rating.aggregateRating}</span>
                        </div>
                      )}
                      {title.type && (
                        <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] uppercase">
                          {title.type === 'tvSeries' ? 'TV' : 'Movie'}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
        )}
        
        {!loading && hasTyped && results.length === 0 && debouncedQuery.length > 2 && (
          <div className="text-center text-zinc-600 py-12">
            No results found for &quot;{query}&quot;
          </div>
        )}
      </div>
    </div>
  );
}