'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MediaCard from '@/components/MediaCard';
import { Check, ChevronDown, Sliders } from 'lucide-react';
import clsx from 'clsx';
import axios from 'axios';

const ITEMS_PER_PAGE = 50;

const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller'
];

export default function TopAnime() {
  const [activeTab, setActiveTab] = useState('shows');
  const [titles, setTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(30);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const triggerRef = useRef(null);
  const filtersRef = useRef(null);
  const panelRef = useRef(null);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 50 }, (_, i) => currentYear - i);
  
  const [filters, setFilters] = useState({
    genres: [],
    year: ''
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const activeFilterCount = filters.genres.length + (filters.year ? 1 : 0);

  const [expandedFilters, setExpandedFilters] = useState({
    genres: true,
    rating: true,
    years: true,
  });

  useEffect(() => {
    if (!filtersOpen) {
      setShowYearPicker(false);
    }
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) return;

    const handleClickOutside = (event) => {
      if (panelRef.current && panelRef.current.contains(event.target)) return;
      if (filtersRef.current && filtersRef.current.contains(event.target)) return;
      setFiltersOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [filtersOpen]);

  useEffect(() => {
    setVisibleCount(30);
    setNextPageToken(null);
    setHasMore(true);

    async function fetchData() {
      setLoading(true);
      try {
        const typeFilter = activeTab === 'movies' ? 'MOVIE' : 'TV_SERIES,TV_MINI_SERIES';
        const params = new URLSearchParams();

        params.append('types', typeFilter.includes(',') ? typeFilter.split(',')[0] : typeFilter);
        if (typeFilter.includes(',')) {
          params.append('types', typeFilter.split(',')[1]);
        }
        params.append('genres', 'Animation');
        params.append('countryCodes', 'JP');
        params.append('sortBy', 'SORT_BY_USER_RATING');
        params.append('sortOrder', 'DESC');
        params.append('minVoteCount', '5000');

        if (filters.genres?.length) {
          filters.genres.forEach(genre => params.append('genres', genre));
        }
        if (filters.year) {
          params.append('startYear', filters.year);
          params.append('endYear', filters.year);
        }

        const response = await axios.get(`/api/proxy/titles?${params.toString()}`);
        setTitles(response.data.titles || []);
        setNextPageToken(response.data.nextPageToken || null);
        if (!response.data.nextPageToken) setHasMore(false);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching anime:', error);
        setTitles([]);
        setLoading(false);
        setHasMore(false);
      }
    }
    fetchData();
  }, [filters, activeTab]);

  const displayedTitles = titles.slice(0, visibleCount);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      let allTitles = [...titles];
      let currentPageToken = nextPageToken;

      // If we still have items to show from current batch, add them first
      if (visibleCount < titles.length) {
        const newCount = Math.min(visibleCount + 25, titles.length);
        setVisibleCount(newCount);
        setIsLoadingMore(false);
        return;
      }

      // Otherwise fetch next page
      if (currentPageToken) {
        const typeFilter = activeTab === 'movies' ? 'MOVIE' : 'TV_SERIES,TV_MINI_SERIES';
        const params = new URLSearchParams();

        params.append('types', typeFilter.includes(',') ? typeFilter.split(',')[0] : typeFilter);
        if (typeFilter.includes(',')) {
          params.append('types', typeFilter.split(',')[1]);
        }
        params.append('genres', 'Animation');
        params.append('countryCodes', 'JP');
        params.append('sortBy', 'SORT_BY_USER_RATING');
        params.append('sortOrder', 'DESC');
        params.append('minVoteCount', '5000');
        params.append('pageToken', currentPageToken);

        if (filters.genres?.length) {
          filters.genres.forEach(genre => params.append('genres', genre));
        }
        if (filters.year) {
          params.append('startYear', filters.year);
          params.append('endYear', filters.year);
        }

        const response = await axios.get(`/api/proxy/titles?${params.toString()}`);
        const newTitles = response.data.titles || [];
        allTitles = [...allTitles, ...newTitles];
        setTitles(allTitles);
        setNextPageToken(response.data.nextPageToken || null);
        if (!response.data.nextPageToken) setHasMore(false);
      }

      const newCount = Math.min(visibleCount + 25, allTitles.length);
      setVisibleCount(newCount);
    } catch (error) {
      console.error('Error loading more anime:', error);
      setHasMore(false);
    }
    setIsLoadingMore(false);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (triggerRef.current) observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [visibleCount, titles.length, isLoadingMore, hasMore, nextPageToken, filters, activeTab]);

  const toggleGenre = (genre) => {
    setFilters(prev => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter(g => g !== genre)
        : [...prev.genres, genre]
    }));
  };

  return (
    <div className="pt-8 min-h-screen pb-24 max-w-6xl mx-auto px-6">
      <div className="max-w-full mx-auto">
        {/* Tab Selection */}
        <div className="relative mb-8" ref={filtersRef}>
          <div className="flex items-center justify-between border-b border-zinc-800">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('movies')}
                className={`pb-3 px-2 font-semibold transition-colors ${
                  activeTab === 'movies'
                    ? 'text-white border-b-2 border-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Top Movies
              </button>
              <button
                onClick={() => setActiveTab('shows')}
                className={`pb-3 px-2 font-semibold transition-colors ${
                  activeTab === 'shows'
                    ? 'text-white border-b-2 border-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Top TV
              </button>
            </div>

            <div className="flex items-center gap-3 pb-2">
              {activeFilterCount > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/10 text-white border border-white/20">
                  {activeFilterCount} Active
                </span>
              )}
              {(filters.genres.length > 0 || filters.year) && (
                <button
                  onClick={() => setFilters({ genres: [], year: '' })}
                  className="text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setFiltersOpen(prev => !prev)}
                className="text-zinc-400 hover:text-white transition-colors"
                aria-label="Toggle filters"
              >
                <Sliders size={18} />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {filtersOpen && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ transformOrigin: 'top right' }}
                className="absolute right-4 top-full mt-2 w-[480px] z-50 rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl shadow-black/80"
              >
                <div className="flex flex-col gap-5">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-bold text-white uppercase tracking-wider">Anime Genres</span>
                      {filters.genres.length > 0 ? (
                        <span className="text-xs font-semibold text-white bg-white/10 px-2.5 py-1 rounded-md border border-white/20">
                          {filters.genres.length} selected
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800">
                          Japanese Content
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {GENRES.map(genre => (
                        <button
                          key={genre}
                          onClick={() => toggleGenre(genre)}
                          className={clsx(
                            'px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border',
                            filters.genres.includes(genre)
                              ? 'bg-white text-black border-white shadow-sm'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800'
                          )}
                        >
                          {genre}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-zinc-900 pt-4">
                    <span className="text-sm font-bold text-white uppercase tracking-wider block mb-3">Year</span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowYearPicker(prev => !prev)}
                        className={clsx(
                          "flex w-full items-center justify-between rounded-lg border bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-zinc-800",
                          showYearPicker ? "border-zinc-600 ring-1 ring-zinc-600/50" : "border-zinc-800"
                        )}
                      >
                        <span className="truncate">{filters.year || 'All Years'}</span>
                        <ChevronDown
                          size={16}
                          className={clsx('text-zinc-500 transition-transform duration-200', showYearPicker && 'rotate-180')}
                        />
                      </button>
                      <AnimatePresence>
                        {showYearPicker && (
                          <motion.div
                            initial={{ opacity: 0, y: -5, scale: 0.95 }}
                            animate={{ opacity: 1, y: 2, scale: 1 }}
                            exit={{ opacity: 0, y: -5, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl z-50 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setFilters(prev => ({ ...prev, year: '' }));
                                setShowYearPicker(false);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                            >
                              All Years
                            </button>
                            {yearOptions.map(y => (
                              <button
                                key={y}
                                type="button"
                                onClick={() => {
                                  setFilters(prev => ({ ...prev, year: String(y) }));
                                  setShowYearPicker(false);
                                }}
                                className={clsx(
                                  "w-full px-4 py-2.5 text-left text-sm font-medium transition-colors",
                                  filters.year === String(y) ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                )}
                              >
                                {y}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-full">
            {loading && titles.length === 0 ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
                  <AnimatePresence mode="popLayout">
                    {displayedTitles.map((title, index) => (
                      <motion.div
                        key={title.id}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        transition={{ duration: 0.3, delay: index * 0.02 }}
                      >
                        <div className="relative">
                          <div className="absolute top-2 left-2 bg-black/90 text-white rounded-[14px] px-3 py-1 shadow-lg border border-white/10 z-10">
                            <span className="text-xs font-black tracking-wide">#{index + 1}</span>
                          </div>
                          <MediaCard title={title} priority={index < 5} />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Infinite Scroll Trigger */}
                <motion.div
                  ref={triggerRef}
                  className="w-full h-24 flex items-center justify-center p-4 mt-8"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {isLoadingMore ? (
                    <motion.div
                      className="flex flex-col items-center gap-3 text-zinc-400 text-sm font-medium"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <motion.div
                        className="w-6 h-6 border-2 border-zinc-600 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                      <span>Loading more anime...</span>
                    </motion.div>
                  ) : !hasMore ? (
                    <motion.span
                      className="text-zinc-600 font-medium"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                    >
                      All anime loaded
                    </motion.span>
                  ) : null}
                </motion.div>
              </>
            )}
          </div>
        </div>
      </div>
  );
}
