'use client';
import { useState, useEffect, useRef } from 'react';
import { getStarMeter } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { User, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import { BLUR_DATA_URL } from '@/lib/api-config';
import { amazonImageLoader } from '@/lib/amazon-image-loader';
import axios from 'axios';

export default function People() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(30);
  const [allPeople, setAllPeople] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const triggerRef = useRef(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await axios.get('/api/proxy/chart/starmeter');
        const peopleList = response.data.names || [];
        setAllPeople(peopleList);
        setPeople(peopleList.slice(0, 30));
        setNextPageToken(response.data.nextPageToken || null);
        if (!response.data.nextPageToken) setHasMore(false);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching people:', error);
        setLoading(false);
        setHasMore(false);
      }
    }
    fetchData();
  }, []);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      let currentPageToken = nextPageToken;
      let allNewPeople = [...allPeople];

      // If we still have items to show from current batch, add them first
      if (visibleCount < allPeople.length) {
        const newCount = Math.min(visibleCount + 25, allPeople.length);
        setVisibleCount(newCount);
        setPeople(allPeople.slice(0, newCount));
        setIsLoadingMore(false);
        return;
      }

      // Otherwise fetch next page
      if (currentPageToken) {
        const response = await axios.get('/api/proxy/chart/starmeter', {
          params: { pageToken: currentPageToken }
        });
        const newPeople = response.data.names || [];
        allNewPeople = [...allPeople, ...newPeople];
        setAllPeople(allNewPeople);
        setNextPageToken(response.data.nextPageToken || null);
        if (!response.data.nextPageToken) setHasMore(false);
      }

      const newCount = Math.min(visibleCount + 25, allNewPeople.length);
      setVisibleCount(newCount);
      setPeople(allNewPeople.slice(0, newCount));
    } catch (error) {
      console.error('Error loading more people:', error);
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
  }, [visibleCount, allPeople, isLoadingMore, hasMore, nextPageToken]);

  return (
    <div className="pt-8 min-h-screen pb-24 max-w-[1600px] mx-auto">
      {loading && people.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full">
          <AnimatePresence mode="popLayout">
            {people.map((person, index) => (
              <motion.div
                key={person.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
              >
                <div className="group block relative rounded-xl overflow-hidden aspect-[3/4] bg-zinc-900/50 border border-white/10 hover:border-white hover:ring-2 hover:ring-white transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl cursor-pointer">
                  {person.primaryImage ? (
                    <Image
                      src={person.primaryImage.url}
                      loader={amazonImageLoader}
                      alt={person.displayName}
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 200px"
                      className="object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-500"
                      priority={index < 4}
                      loading={index < 4 ? undefined : "lazy"}
                      placeholder="blur"
                      blurDataURL={BLUR_DATA_URL}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/60 via-zinc-900 to-black relative overflow-hidden">
                      <div className="absolute inset-0 opacity-20">
                        <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
                      </div>
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        <User size={42} className="text-zinc-600 opacity-60" />
                        <span className="text-xs text-zinc-600 font-medium">No photo</span>
                      </div>
                    </div>
                  )}

                  {person.meterRanking && (
                    <div className="absolute top-2 left-2 z-10">
                      <div className="bg-black/60 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1 border border-white/10">
                        <TrendingUp size={10} className={person.meterRanking.changeDirection === 'UP' ? "text-green-500" : person.meterRanking.changeDirection === 'DOWN' ? "text-red-500" : "text-gray-400"} />
                        #{person.meterRanking.currentRank}
                      </div>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <h3 className="font-bold text-base text-white leading-tight mb-1 text-center">
                      {person.displayName}
                    </h3>
                    {person.primaryProfessions?.length > 0 && (
                      <p className="text-xs text-zinc-400 text-center line-clamp-1">
                        {person.primaryProfessions.join(', ')}
                      </p>
                    )}
                  </div>
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
              className="flex flex-col items-center gap-2 text-zinc-500 text-sm font-medium"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div 
                className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-400 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              Loading more stars...
            </motion.div>
          ) : !hasMore ? (
            <motion.span 
              className="text-zinc-600 font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              All stars loaded
            </motion.span>
          ) : null}
        </motion.div>
        </>
      )}
    </div>
  );
}
