'use client';
import { useState, useEffect } from 'react';
import { getFilteredTitles } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import MediaCard from '@/components/MediaCard';
import FilterPanel from '@/components/FilterPanel';

export default function Trending() {
  const [titles, setTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    types: [],
    genres: [],
    minRating: '',
  });

  useEffect(() => {
    async function fetchData() {
      const data = await getFilteredTitles({
        types: filters.types.length ? filters.types : ['MOVIE', 'TV_SERIES', 'TV_MINI_SERIES'],
        genres: filters.genres,
        minRating: filters.minRating || undefined,
        sortBy: 'SORT_BY_POPULARITY',
        minVoteCount: 5000
      });
      setTitles(data.titles || []);
      setLoading(false);
    }
    fetchData();
  }, [filters]);

  const filterConfig = [
    {
      key: 'types',
      label: 'Type',
      multiple: true,
      options: [
        { label: 'Movies', value: 'MOVIE' },
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
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Thriller', value: 'Thriller' },
        { label: 'Romance', value: 'Romance' },
        { label: 'Sci-Fi', value: 'Sci-Fi' },
        { label: 'Fantasy', value: 'Fantasy' },
      ]
    },
    {
      key: 'minRating',
      label: 'Min Rating',
      multiple: false,
      options: [
        { label: 'All Ratings', value: '' },
        { label: '9+ ⭐', value: '9' },
        { label: '8+ ⭐', value: '8' },
        { label: '7+ ⭐', value: '7' },
      ]
    },
  ];

  return (
    <div className="pt-2 min-h-screen max-w-[1600px] mx-auto px-6">
      <div className="text-center mb-8 flex flex-col items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-white mb-2">Trending Now</h1>
          <p className="text-zinc-500 text-sm">Most popular this week</p>
        </div>
        <FilterPanel filters={filters} onFiltersChange={setFilters} filterConfig={filterConfig} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full pb-24">
          <AnimatePresence mode="popLayout">
            {titles.map((title, index) => (
              <motion.div
                key={title.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
              >
                <MediaCard title={title} priority={index < 5} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
