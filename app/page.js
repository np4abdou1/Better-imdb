'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { searchTitles, createAbortController, cancelRequest } from '@/lib/api';
import clsx from 'clsx';
import MediaCard from '@/components/MediaCard';

const PLACEHOLDERS = ["Find your next favorite show...", "Explore movies and series...", "Search titles, actors, directors...", "What do you want to watch?"];

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [hasTyped, setHasTyped] = useState(false);
  const searchRequestId = useRef(0);

  // Placeholder Animation State
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderCharIndex, setPlaceholderCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Typing Animation
  useEffect(() => {
    const timeout = setTimeout(() => {
      const currentPlaceholder = PLACEHOLDERS[placeholderIndex];

      if (!isDeleting && placeholderCharIndex < currentPlaceholder.length) {
        setPlaceholderCharIndex(prev => prev + 1);
      } else if (isDeleting && placeholderCharIndex > 0) {
        setPlaceholderCharIndex(prev => prev - 1);
      } else if (!isDeleting && placeholderCharIndex === currentPlaceholder.length) {
        setTimeout(() => setIsDeleting(true), 2000);
      } else if (isDeleting && placeholderCharIndex === 0) {
        setIsDeleting(false);
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
      }
    }, isDeleting ? 50 : 100);

    return () => clearTimeout(timeout);
  }, [placeholderCharIndex, isDeleting, placeholderIndex]);

  // Search Logic - Instant transition when typing starts
  useEffect(() => {
    setHasTyped(query.length > 0);

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

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      cancelRequest('search');
    };
  }, []);

  const handleSearch = async (q) => {
    const currentRequestId = ++searchRequestId.current;
    cancelRequest('search');
    const controller = createAbortController('search');

    setLoading(true);
    try {
      const data = await searchTitles(q, controller.signal);
      if (currentRequestId === searchRequestId.current) {
        const sortedResults = (data.titles || []).sort((a, b) => {
          const ratingA = a.rating?.aggregateRating || 0;
          const ratingB = b.rating?.aggregateRating || 0;
          return ratingB - ratingA; // Descending order (highest first)
        });
        setResults(sortedResults);
      }
    } catch (error) {
      if (error.name !== 'AbortError' && error.code !== 'ERR_CANCELED') {
        console.error(error);
      }
    } finally {
      if (currentRequestId === searchRequestId.current) {
        setLoading(false);
      }
    }
  };

  const handleLogoClick = () => {
    setQuery('');
    setHasTyped(false);
    setResults([]);
    cancelRequest('search');
  };

  return (
    <div className={clsx(
      "min-h-screen w-full flex flex-col items-center relative overflow-hidden text-white",
      hasTyped ? "justify-start pt-8" : "justify-center",
      hasTyped ? "transition-none" : "transition-all duration-700 ease-out"
    )}>

      {/* Main Layout Container */}
      <motion.div
        layout
        transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}
        className={clsx(
          "w-full px-6 flex z-50 items-center relative",
          hasTyped ? "flex-row gap-6 max-w-6xl" : "flex-col gap-12 max-w-2xl"
        )}
      >
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
             Better IMDb
           </motion.div>
         </motion.div>

        <motion.div
          layout
          className={clsx(
            "relative group w-full",
            hasTyped ? "flex-1" : ""
          )}
        >
          <div className="relative">
            <div className={clsx(
              "absolute left-0 flex items-center pointer-events-none transition-all duration-300 z-10",
              "top-1/2 -translate-y-1/2"
            )}>
              <Search
                size={hasTyped ? 20 : 24}
                className="text-zinc-500 group-focus-within:text-white transition-colors duration-300"
              />
            </div>

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

      {/* Results Grid */}
      <div className={clsx(
        "w-full mt-12 pb-20 relative z-10",
        hasTyped ? "max-w-6xl mx-auto" : "max-w-[1920px] px-6"
      )}>
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
                transition={{ duration: 0.3, delay: index * 0.03 }}
                layout
              >
                <MediaCard title={title} priority={index < 5} />
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
