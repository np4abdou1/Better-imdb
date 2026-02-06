'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Film, Star, Plus, Check, Eye, Bookmark, LucideIcon } from 'lucide-react';
import { amazonImageLoader } from '@/lib/amazon-image-loader';
import { BLUR_DATA_URL } from '@/lib/api-config';
import clsx from 'clsx';

/**
 * InlineMediaCard Component
 * Renders a single media card with async client-side data fetching
 * Matches the global MediaCard styling and hover effects
 */

interface InlineMediaCardProps {
  id: string;
  title?: string;
  year?: string | number;
  reason?: string;
  index?: number;
}

interface MediaData {
  id: string;
  primaryTitle: string;
  startYear?: string | number;
  type: string;
  rating: { aggregateRating: number } | null;
  primaryImage: { url: string } | null;
  reason?: string;
}

interface ListOption {
  id: string;
  label: string;
  icon: LucideIcon;
}

function InlineMediaCard({ id, title, year, reason, index = 0 }: InlineMediaCardProps) {
  const [data, setData] = useState<MediaData | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [error, setError] = useState<string | null>(null);
  const [isAdded, setIsAdded] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const listOptions: ListOption[] = [
    { id: 'To Watch', label: 'To Watch', icon: Bookmark },
    { id: 'Watching', label: 'Watching', icon: Eye },
    { id: 'Watched', label: 'Watched', icon: Check },
  ];

  const handleAddToList = async (e: React.MouseEvent, listName: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (selectedList === listName) return;

    try {
      // Optimistic update
      setIsAdded(true);
      setSelectedList(listName);
      setShowListMenu(false);

      await fetch('/api/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ list: listName, itemId: id })
      });

      // Auto-close menu after 1.5 seconds
      setTimeout(() => {
        setIsAdded(false);
        setSelectedList(null);
      }, 1500);
    } catch (err) {
      console.error('Failed to add to list', err);
      setIsAdded(false);
      setSelectedList(null);
    }
  };

  const toggleMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowListMenu(!showListMenu);
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (!showListMenu) return;
    const handleClick = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
            setShowListMenu(false);
        }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showListMenu]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('No ID provided');
      return;
    }

    const fetchTitleData = async () => {
      try {
        const response = await fetch(`/api/proxy/titles/${id}`);
        if (!response.ok) throw new Error('Failed to fetch title details');
        
        const titleData = await response.json();
        
        console.log(`[InlineMediaCard] Title data for ${id}:`, titleData);
        
        // Extract poster from primaryImage.url (external API format)
        const posterUrl = titleData.primaryImage?.url || titleData.poster || null;
        
        // Parse rating - try to extract from the API response
        let ratingValue: number | null = null;
        
        if (titleData.rating && typeof titleData.rating === 'object' && titleData.rating.aggregateRating) {
          // If rating is an object with aggregateRating field
          const parsed = parseFloat(titleData.rating.aggregateRating);
          ratingValue = !isNaN(parsed) && isFinite(parsed) ? parsed : null;
        } else if (typeof titleData.rating === 'number') {
          // If rating is directly a number
          ratingValue = !isNaN(titleData.rating) && isFinite(titleData.rating) ? titleData.rating : null;
        }
        
        console.log(`[InlineMediaCard] Parsed rating for ${id}:`, ratingValue, 'from:', titleData.rating);
        
        setData({
          id,
          primaryTitle: titleData.title || titleData.primaryTitle || title || 'Unknown',
          startYear: titleData.year || titleData.startYear || year,
          type: titleData.type || titleData.titleType || 'Movie',
          rating: ratingValue !== null ? { aggregateRating: ratingValue } : null,
          primaryImage: posterUrl ? { url: posterUrl } : null,
          reason
        });
        setError(null);
      } catch (err) {
        console.error(`Error fetching title ${id}:`, err);
        // Fallback to minimal data
        setData({
          id,
          primaryTitle: title || 'Unknown Title',
          startYear: year,
          type: 'Movie',
          reason,
          primaryImage: null,
          rating: null
        });
      } finally {
        setLoading(false);
      }
    };

    // Small delay to avoid burst of requests
    const timer = setTimeout(fetchTitleData, index * 50);
    return () => clearTimeout(timer);
  }, [id, title, year, reason, index]);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.03, duration: 0.2 }}
        className="h-full w-full rounded-xl bg-zinc-800/50 animate-pulse aspect-[2/3]"
      />
    );
  }

  if (!data) {
    return null;
  }

  // Helper to get type label
  const getTypeLabel = (type: string) => {
    if (type === 'tvMiniSeries' || type === 'TV_MINI_SERIES') return 'Mini';
    if (type === 'tvSeries' || type === 'TV_SERIES') return 'TV';
    return 'Movie';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.4 }}
      className="h-full w-full"
    >
      <Link
        href={`/title/${data.id}`}
        className={clsx(
            "group block relative rounded-xl overflow-hidden aspect-[2/3] bg-zinc-900/50 border border-white/10 transition-all duration-150 shadow-lg h-full w-full",
            // If menu is open, force hover styles
            showListMenu ? "border-white ring-2 ring-white shadow-2xl z-30" : "hover:border-white hover:ring-2 hover:ring-white hover:shadow-2xl"
        )}
      >
        {data.primaryImage ? (
          <Image
            src={data.primaryImage.url}
            loader={amazonImageLoader}
            alt={data.primaryTitle}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1600px) 25vw, 320px"
            className="object-cover grayscale-[10%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500"
            priority={false}
            loading="lazy"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/60 via-zinc-900 to-black relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10 flex flex-col items-center gap-2">
              <Film size={42} className="text-zinc-600 opacity-60" />
              <span className="text-xs text-zinc-600 font-medium">No poster</span>
            </div>
          </div>
        )}

        {/* Hover Actions - List Menu */}
        <div 
          className={clsx(
              "absolute top-2 right-2 flex flex-col gap-2 z-40 transition-all duration-300 transform",
              showListMenu ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0"
          )}
          onClick={(e) => e.stopPropagation()} // Prevent link click
        >
            <div className="relative" ref={menuRef}>
                <button 
                  onClick={toggleMenu}
                  className={clsx(
                      "p-2.5 rounded-full transition-all border shadow-lg active:scale-95 flex items-center justify-center",
                      isAdded && !showListMenu
                        ? "bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30" 
                        : showListMenu
                          ? "bg-white text-black border-white/20 hover:bg-zinc-100"
                          : "bg-black/60 backdrop-blur-xl text-white border-white/20 hover:bg-white hover:text-black"
                  )}
                  title={selectedList ? `Added to ${selectedList}` : "Add to list"}
                >
                   {isAdded && !showListMenu ? <Check size={16} /> : <Plus size={16} />}
                </button>

                <AnimatePresence>
                    {showListMenu && (
                         <motion.div 
                            initial={{ opacity: 0, scale: 0.85, y: 8, x: 6 }}
                            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                            exit={{ opacity: 0, scale: 0.85, y: 8 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25, duration: 0.2 }}
                            className="absolute right-0 top-full mt-3 bg-gradient-to-b from-[#272729] to-[#1a1a1c] border border-zinc-700/50 rounded-2xl p-3 w-48 shadow-2xl overflow-hidden flex flex-col gap-1 backdrop-blur-xl"
                         >
                             <div className="px-3 py-2 text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                                 Add to List
                             </div>
                             <div className="h-px bg-gradient-to-r from-white/0 via-white/20 to-white/0 mx-2 my-0.5" />
                             {listOptions.map((opt, idx) => (
                                 <motion.button
                                    key={opt.id}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05, duration: 0.2 }}
                                    onClick={(e) => handleAddToList(e, opt.id)}
                                    className={clsx(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left transition-all duration-200 relative group",
                                        selectedList === opt.id 
                                          ? "bg-white/15 text-white border border-white/30" 
                                          : "text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent"
                                    )}
                                 >
                                    <div className="flex items-center justify-center w-5 h-5">
                                      <opt.icon size={16} strokeWidth={2.2} />
                                    </div>
                                    <span>{opt.label}</span>
                                    {selectedList === opt.id && (
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 400 }}
                                        className="ml-auto"
                                      >
                                        <Check size={14} className="text-white" strokeWidth={3} />
                                      </motion.div>
                                    )}
                                 </motion.button>
                             ))}
                         </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>

        {/* Overlay with metadata */}
        <div className={clsx(
            "absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent transition-opacity duration-300 flex flex-col justify-end p-4",
            showListMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <h3 className="font-bold text-base text-white leading-tight mb-2 line-clamp-2">
            {data.primaryTitle}
          </h3>

          <div className="flex items-center gap-3 text-xs font-medium text-zinc-300">
            {data.startYear && <span>{data.startYear}</span>}
            {data.rating?.aggregateRating && typeof data.rating.aggregateRating === 'number' && !isNaN(data.rating.aggregateRating) && (
              <div className="flex items-center gap-1 text-white">
                <span className="font-semibold">{data.rating.aggregateRating.toFixed(1)}</span>
                <Star size={12} fill="currentColor" />
              </div>
            )}
            {data.type && (
              <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] uppercase border border-white/10">
                {getTypeLabel(data.type)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default InlineMediaCard;
