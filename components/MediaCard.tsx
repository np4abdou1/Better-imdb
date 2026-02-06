'use client';

import { memo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Film, Star, Plus, Check, Loader2 } from 'lucide-react';
import { amazonImageLoader } from '@/lib/amazon-image-loader';
import { BLUR_DATA_URL } from '@/lib/api-config';
import clsx from 'clsx';
import { useSession } from 'next-auth/react';
import { Title } from '@/types';

interface MediaCardProps {
  title: Title;
  priority?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

function MediaCard({ 
  title, 
  priority = false, 
  selectable = false, 
  selected = false, 
  onSelect 
}: MediaCardProps) {
  if (!title) return null;

  const { data: session } = useSession();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch user lists when menu opens
  useEffect(() => {
    if (showAddMenu && session) {
      fetch('/api/lists')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setLists(data);
          }
        })
        .catch(console.error);
    }
  }, [showAddMenu, session]);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    }
    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAddMenu]);

  const handleAddToList = async (listId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!session || loading) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title_id: title.id })
      });

      if (response.ok) {
        setAdded(true);
        setTimeout(() => {
          setAdded(false);
          setShowAddMenu(false);
        }, 1500);
      } else if (response.status === 409) {
        // Already in list - show feedback
        setAdded(true);
        setTimeout(() => {
          setAdded(false);
          setShowAddMenu(false);
        }, 1500);
      }
    } catch (error) {
      console.error('Failed to add to list:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAddClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session) {
      window.location.href = '/login';
      return;
    }
    setShowAddMenu(!showAddMenu);
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onSelect) {
      onSelect(title.id);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (selectable) {
      e.preventDefault();
      if (onSelect) onSelect(title.id);
    }
  };

  return (
    <div className="h-full w-full relative">
      {/* Selection Checkbox (top-left, appears when selectable) */}
      {selectable && (
        <div
          onClick={handleSelectClick}
          className="absolute top-2 left-2 z-20 cursor-pointer"
        >
          <div className={clsx(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
            selected
              ? "bg-white border-white scale-110"
              : "bg-black/40 border-white/60 backdrop-blur-md hover:border-white hover:bg-black/60"
          )}>
            {selected && <Check size={14} className="text-black" strokeWidth={3} />}
          </div>
        </div>
      )}

      {/* Quick Add Button (top-right, appears on hover) */}
      {!selectable && session && (
        <div
          ref={menuRef}
          className="absolute top-2 right-2 z-20"
        >
          <button
            onClick={handleQuickAddClick}
            className={clsx(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-sm",
              "opacity-0 group-hover:opacity-100",
              added ? "bg-green-500 border-green-500" : "bg-black/60 border border-white/40 hover:bg-white/20 hover:border-white"
            )}
            disabled={loading || added}
            title="Add to list"
          >
            {loading ? (
              <Loader2 size={16} className="text-white animate-spin" />
            ) : added ? (
              <Check size={16} className="text-white" />
            ) : (
              <Plus size={16} className="text-white" />
            )}
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {showAddMenu && !added && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-10 w-48 bg-zinc-900 border border-white/20 rounded-lg shadow-2xl overflow-hidden"
              >
                <div className="py-1">
                  <div className="px-3 py-2 text-xs text-zinc-400 font-medium uppercase tracking-wider border-b border-white/10">
                    Add to list
                  </div>
                  {lists.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-zinc-500">Loading...</div>
                  ) : (
                    lists.map(list => (
                      <button
                        key={list.id}
                        onClick={(e) => handleAddToList(list.id, e)}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                        disabled={loading}
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
      )}

      <Link
        href={`/title/${title.id}`}
        onClick={handleCardClick}
        className={clsx(
          "group block relative rounded-xl overflow-hidden aspect-[2/3]",
          "bg-zinc-900/50 border-2",
          selectable && selected ? "border-white shadow-[0_0_0_4px_rgba(255,255,255,0.2)]" : "border-white/10",
          !selectable && "hover:border-white/60 hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:scale-[1.02]",
          "transition-all duration-300 shadow-lg",
          selectable && !selected && "hover:border-white/40",
          "h-full w-full"
        )}
      >
        {title.primaryImage ? (
          <Image
            src={title.primaryImage.url}
            loader={amazonImageLoader}
            alt={title.primaryTitle || "Title poster"}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1600px) 25vw, 320px"
            className="object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-500"
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
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

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
          <h3 className="font-bold text-sm text-white leading-tight mb-2 line-clamp-2">
            {title.primaryTitle}
          </h3>

          <div className="flex items-center gap-3 text-xs font-medium text-zinc-300">
            {title.startYear && <span>{title.startYear}</span>}
            {title.rating && (
              <div className="flex items-center gap-1 text-white">
                <span className="font-semibold">{title.rating.aggregateRating}</span>
                <Star size={12} fill="currentColor" />
              </div>
            )}
            {title.type && (
              <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] uppercase">
                {title.type === 'tvMiniSeries' || title.type === 'TV_MINI_SERIES'
                  ? 'Mini'
                  : title.type === 'tvSeries' || title.type === 'TV_SERIES'
                    ? 'TV'
                    : 'Movie'}
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

export default memo(MediaCard);
