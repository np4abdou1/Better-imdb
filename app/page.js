'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CheckSquare, X, Plus, Loader2 } from 'lucide-react';
import { searchTitles, getFilteredTitles, createAbortController, cancelRequest } from '@/lib/api';
import clsx from 'clsx';
import MediaCard from '@/components/MediaCard';
import FilterPanel from '@/components/FilterPanel';
import { useSession } from 'next-auth/react';

const PLACEHOLDERS = ["Find your next favorite show...", "Explore movies and series...", "Search titles, actors, directors...", "What do you want to watch?"];

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 75 }, (_, i) => {
  const year = String(currentYear - i);
  return { label: year, value: year };
});

export default function Home() {
  const { data: session } = useSession();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageToken, setPageToken] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [hasTyped, setHasTyped] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const searchRequestId = useRef(0);

  // Select mode state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [lists, setLists] = useState([]);
  const bulkMenuRef = useRef(null);

  // Filter state
  const [filters, setFilters] = useState({
    types: [],
    genres: [],
    startYear: '',
    endYear: '',
    countryCodes: [],
  });
  const [hasFilters, setHasFilters] = useState(false);

  // Infinite scroll observer ref
  const observerTarget = useRef(null);

  // Placeholder Animation State
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderCharIndex, setPlaceholderCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showBulkMenu) {
          setShowBulkMenu(false);
          return;
        }
        if (selectMode) {
          setSelectMode(false);
          setSelectedIds(new Set());
          return;
        }
        if (query || hasFilters) {
          setQuery('');
          setFilters({
            types: [],
            genres: [],
            startYear: '',
            endYear: '',
            countryCodes: [],
          });
          setIsFocused(false);
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showBulkMenu, selectMode, query, hasFilters]);

  // Handle Reset Event (from Home button click)
  useEffect(() => {
    const handleReset = () => {
      setQuery('');
      setFilters({
        types: [],
        genres: [],
        startYear: '',
        endYear: '',
        countryCodes: [],
      });
      setSelectMode(false);
      setSelectedIds(new Set());
      setShowBulkMenu(false);
      setIsFocused(false);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };

    window.addEventListener('reset-search', handleReset);
    return () => window.removeEventListener('reset-search', handleReset);
  }, []);

  // Check if any filters are active
  useEffect(() => {
    const active =
      filters.types.length > 0 ||
      filters.genres.length > 0 ||
      filters.startYear !== '' ||
      filters.endYear !== '' ||
      filters.countryCodes.length > 0;
    setHasFilters(active);
  }, [filters]);

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
    setHasTyped(query.length > 0 || hasFilters || isFocused);

    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);

    return () => clearTimeout(timer);
  }, [query, hasFilters, isFocused]);

  useEffect(() => {
    // If user typed a search query, use text search
    if (debouncedQuery.length > 0) {
      handleSearch(debouncedQuery);
      setPageToken(null);
      setHasMore(false);
    }
    // If only filters are active (no text), use filtered discovery
    else if (hasFilters) {
      handleFilteredSearch();
    }
    // No query and no filters - show discover mode if search bar focused
    else if (hasTyped && !hasFilters && debouncedQuery.length === 0) {
      handleFilteredSearch();
    }
    // No query and no filters and not focused - clear results
    else {
      setResults([]);
      setPageToken(null);
      setHasMore(false);
    }
  }, [debouncedQuery, filters, hasFilters, hasTyped]);

  // Infinite scroll observer for discovery mode
  useEffect(() => {
    // Enable for both:
    // 1. Discovery mode (no query)
    // 2. Search mode (query > 2 chars)
    if (debouncedQuery.length > 0 && debouncedQuery.length <= 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMoreResults();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasFilters, hasMore, loadingMore, debouncedQuery, pageToken]);

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
        let sortedResults = (data.titles || []).sort((a, b) => {
          const ratingA = a.rating?.aggregateRating || 0;
          const ratingB = b.rating?.aggregateRating || 0;
          return ratingB - ratingA; // Descending order (highest first)
        });

        // Filter out Indian content
        sortedResults = sortedResults.filter(t => 
            t.country?.code !== 'IN' && 
            !t.countries?.some(c => c.code === 'IN')
        );

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

  const handleFilteredSearch = async (isLoadMore = false) => {
    const currentRequestId = ++searchRequestId.current;

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setPageToken(null);
    }

    try {
      const data = await getFilteredTitles({
        types: filters.types.length ? filters.types : ['MOVIE', 'TV_SERIES', 'TV_MINI_SERIES'],
        genres: filters.genres,
        countryCodes: filters.countryCodes,
        startYear: filters.startYear || undefined,
        endYear: filters.endYear || undefined,
        sortBy: 'SORT_BY_USER_RATING_COUNT',
        minVoteCount: 2500,
        pageToken: isLoadMore ? pageToken : undefined
      });

      if (currentRequestId === searchRequestId.current) {
        let newTitles = data.titles || [];
        
        // Filter out Indian content
        newTitles = newTitles.filter(t => 
            t.country?.code !== 'IN' && 
            !t.countries?.some(c => c.code === 'IN')
        );

        if (isLoadMore) {
          setResults(prev => [...prev, ...newTitles]);
        } else {
          setResults(newTitles);
        }
        setPageToken(data.nextPageToken || null);
        setHasMore(!!data.nextPageToken);
      }
    } catch (error) {
      console.error(error);
    } finally {
      if (currentRequestId === searchRequestId.current) {
        if (isLoadMore) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    }
  };

  const loadMoreResults = () => {
    if (pageToken && hasMore && !loadingMore) {
      handleFilteredSearch(true);
    }
  };

  // Select mode handlers
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedIds(new Set());
    setShowBulkMenu(false);
  };

  const handleSelect = (titleId) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(titleId)) {
      newSelected.delete(titleId);
    } else {
      newSelected.add(titleId);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(results.map(r => r.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Fetch user lists when bulk menu opens
  useEffect(() => {
    if (showBulkMenu && session) {
      fetch('/api/lists')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setLists(data);
          }
        })
        .catch(console.error);
    }
  }, [showBulkMenu, session]);

  // Close bulk menu on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(event.target)) {
        setShowBulkMenu(false);
      }
    }
    if (showBulkMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showBulkMenu]);

  const handleBulkAddToList = async (listId) => {
    if (!session || selectedIds.size === 0 || bulkActionLoading) return;

    setBulkActionLoading(true);
    const titleIds = Array.from(selectedIds);
    
    try {
      let successCount = 0;
      for (const titleId of titleIds) {
        try {
          const response = await fetch(`/api/lists/${listId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title_id: titleId })
          });
          if (response.ok || response.status === 409) {
            successCount++;
          }
        } catch (error) {
          console.error(`Failed to add ${titleId}:`, error);
        }
      }
      
      // Success feedback
      window.dispatchEvent(new CustomEvent('show-notification', { 
        detail: { message: `Added ${successCount} items to list` } 
      }));
      
      setShowBulkMenu(false);
      setSelectMode(false);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Bulk add failed:', error);
      alert('Failed to add items to list');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const filterConfig = [
    {
      key: 'types',
      label: 'Type',
      multiple: true,
      options: [
        { label: 'Movie', value: 'MOVIE' },
        { label: 'TV Series', value: 'TV_SERIES' },
        { label: 'Mini Series', value: 'TV_MINI_SERIES' },
      ]
    },
    {
      key: 'genres',
      label: 'Genre',
      multiple: true,
      options: [
        { label: 'Action', value: 'Action' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Animation', value: 'Animation' },
        { label: 'Biography', value: 'Biography' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Crime', value: 'Crime' },
        { label: 'Documentary', value: 'Documentary' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Family', value: 'Family' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Film-Noir', value: 'Film-Noir' },
        { label: 'History', value: 'History' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Music', value: 'Music' },
        { label: 'Musical', value: 'Musical' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Romance', value: 'Romance' },
        { label: 'Sci-Fi', value: 'Sci-Fi' },
        { label: 'Short', value: 'Short' },
        { label: 'Sport', value: 'Sport' },
        { label: 'Thriller', value: 'Thriller' },
        { label: 'War', value: 'War' },
        { label: 'Western', value: 'Western' }
      ]
    },
    {
      key: 'startYear',
      label: 'From Year',
      multiple: false,
      options: [
        { label: 'Any', value: '' },
        ...yearOptions
      ]
    },
    {
      key: 'endYear',
      label: 'To Year',
      multiple: false,
      options: [
        { label: 'Any', value: '' },
        ...yearOptions
      ]
    },
    {
      key: 'countryCodes',
      label: 'Country',
      multiple: true,
      options: [
        { label: 'USA', value: 'US' },
        { label: 'UK', value: 'GB' },
        { label: 'Japan', value: 'JP' },
        { label: 'South Korea', value: 'KR' },
        { label: 'France', value: 'FR' },
        { label: 'Germany', value: 'DE' },
        { label: 'Spain', value: 'ES' },
      ]
    },
  ];

  return (
    <div className={clsx(
      "min-h-screen w-full flex flex-col items-center relative overflow-hidden text-white",
      hasTyped ? "justify-start pt-2" : "justify-center",
      hasTyped ? "transition-none" : "transition-all duration-700 ease-out"
    )}>

      {/* Main Layout Container */}
      <motion.div
        layout
        transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}
        className={clsx(
          "w-full px-6 flex z-50 items-center relative",
          hasTyped ? "flex-row gap-4 max-w-6xl border-b border-white/20 focus-within:border-white pb-1 transition-colors duration-300" : "flex-col gap-12 max-w-2xl"
        )}
      >
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
              onFocus={() => setIsFocused(true)}
              className={clsx(
                  "w-full bg-transparent text-white placeholder-transparent",
                  "focus:outline-none transition-all font-light tracking-wide",
                  "selection:bg-white/20 selection:text-white",
                  "transition-colors duration-300",
                hasTyped
                    ? "pl-8 pr-4 py-2 text-lg border-none focus:ring-0"
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

        {hasTyped && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 shrink-0"
          >
             {/* Select Mode Toggle */}
              {session && results.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectMode}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                      selectMode
                        ? "bg-white text-black"
                        : "bg-zinc-800 text-white hover:bg-zinc-700" 
                    )}
                  >
                    {selectMode ? <X size={16} /> : <CheckSquare size={16} />}
                    {selectMode ? 'Cancel' : 'Select'}
                  </button>
                  
                  {selectMode && (
                     <button
                        onClick={selectAll}
                        className="text-xs text-zinc-400 hover:text-white transition-colors underline ml-2 whitespace-nowrap"
                      >
                        All
                      </button>
                  )}
                </div>
              )}

               {/* Selection Count & Bulk Actions*/}
               <AnimatePresence>
                  {selectMode && selectedIds.size > 0 && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center gap-3"
                    >
                      <span className="text-xs font-bold bg-white text-black px-2 py-0.5 rounded">
                        {selectedIds.size}
                      </span>

                      <div className="relative" ref={bulkMenuRef}>
                        <button
                          onClick={() => setShowBulkMenu(!showBulkMenu)}
                          disabled={bulkActionLoading}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all border bg-zinc-900/50 border-white/20 text-white hover:border-white/40 hover:bg-zinc-900/80 disabled:opacity-50 whitespace-nowrap"
                        >
                          {/* Replaced standard Plus with Loader if loading, but user asked for button like filter button, so size is handled by classes */}
                          {bulkActionLoading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Plus size={16} />
                          )}
                          <span className="text-xs font-semibold">Add to List</span>
                        </button>

                        {/* Bulk Actions Menu - Right Aligned */}
                        <AnimatePresence>
                          {showBulkMenu && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 5 }}
                              transition={{ duration: 0.1 }}
                              className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-[100]"
                            >
                              <div className="py-1">
                                <div className="px-3 py-2 text-xs text-zinc-400 font-medium uppercase tracking-wider border-b border-zinc-800">
                                  Add {selectedIds.size} items to list
                                </div>
                                {lists.length === 0 ? (
                                  <div className="px-3 py-2 text-sm text-zinc-500">Loading...</div>
                                ) : (
                                  lists.map(list => (
                                    <button
                                      key={list.id}
                                      onClick={() => handleBulkAddToList(list.id)}
                                      className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-zinc-800 transition-colors"
                                      disabled={bulkActionLoading}
                                    >
                                      {list.name}
                                    </button>
                                  ))
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
               </AnimatePresence>
            
            {/* Filter Panel */}
            <FilterPanel filters={filters} onFiltersChange={setFilters} filterConfig={filterConfig} />
          </motion.div>
        )}
      </motion.div>

      {/* Results Grid */}
      <div className={clsx(
        "w-full pb-20 relative z-10",
        hasTyped ? "max-w-7xl mx-auto px-6 mt-4" : "max-w-[1920px] px-6 mt-12"
      )}>
        {/* Removed old Bulk Action Bar */}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 w-full relative z-0">
          <AnimatePresence mode="popLayout">
            {results.map((title, index) => (
              <motion.div
                layout
                key={title.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                transition={{ duration: 0.3, delay: (index % 50) * 0.03 }}
              >
                <MediaCard 
                  title={title} 
                  priority={index < 5}
                  selectable={selectMode}
                  selected={selectedIds.has(title.id)}
                  onSelect={handleSelect}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
        )}

        {/* Infinite scroll observer target */}
        {hasMore && !loading && (debouncedQuery.length <= 0 || debouncedQuery.length > 2) && (
          <div ref={observerTarget} className="flex justify-center py-8">
            {loadingMore && (
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            )}
          </div>
        )}

        {!loading && hasTyped && results.length === 0 && (debouncedQuery.length > 0 || hasFilters) && (
          <div className="text-center text-zinc-600 py-12">
            {query
              ? `No results found for "${query}"`
              : 'No titles match your filters. Try adjusting your criteria.'
            }
          </div>
        )}
      </div>
    </div>
  );
}
