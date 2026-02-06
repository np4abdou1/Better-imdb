'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MediaCard from '@/components/MediaCard';
import FilterPanel from '@/components/FilterPanel';
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
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 50 }, (_, i) => currentYear - i);
  
  const [filters, setFilters] = useState({
    genres: [],
    year: ''
  });

  const filterConfig = [
    {
      key: 'genres',
      label: 'Genres',
      options: GENRES.map(g => ({ label: g, value: g })),
      multiple: true
    },
    {
      key: 'year',
      label: 'Year',
      options: yearOptions.map(y => ({ label: String(y), value: String(y) })),
      multiple: false
    }
  ];

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

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



  return (
    <div className="pt-2 min-h-screen pb-24 max-w-[1600px] mx-auto px-6">
      <div className="max-w-full mx-auto">
        {/* Tab Selection */}
        <div className="relative mb-8">
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

            <div className="pb-2">
              <FilterPanel 
                 filters={filters}
                 onChange={handleFilterChange}
                 filterConfig={filterConfig}
              />
            </div>
          </div>
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
                        layout
                        key={title.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.3, delay: (index % visibleCount) * 0.03 }}
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
