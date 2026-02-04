'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Film, Star } from 'lucide-react';
import { amazonImageLoader } from '@/lib/amazon-image-loader';
import { BLUR_DATA_URL } from '@/lib/api-config';
import clsx from 'clsx';

function MediaCard({ title, priority = false }) {
  if (!title) return null;

  return (
    <div className="h-full w-full">
      <Link
        href={`/title/${title.id}`}
        className={clsx(
          "group block relative rounded-xl overflow-hidden aspect-[2/3]",
          "bg-zinc-900/50 border border-white/10",
          "hover:border-white hover:ring-2 hover:ring-white hover:scale-[1.02]",
          "transition-all duration-300 shadow-lg hover:shadow-2xl",
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
