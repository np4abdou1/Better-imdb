'use client';

import { Play, Television, FilmStrip } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

export default function InlineStreamCard({ data, onPlay }: { data: any, onPlay: any }) {
  if (!data) return null;

  const isTv = data.media_type === 'tv';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-4 bg-zinc-900/50 border border-zinc-700/50 rounded-xl overflow-hidden max-w-md w-full group hover:border-zinc-600 transition-colors"
    >
      <div className="p-4 flex items-start gap-4">
        <div className="w-16 h-24 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0 border border-zinc-700/50">
          {isTv ? (
            <Television size={32} className="text-zinc-500" />
          ) : (
            <FilmStrip size={32} className="text-zinc-500" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              Ready to Watch
            </span>
            {isTv && (
               <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                 S{data.season} E{data.episode}
               </span>
            )}
          </div>
          
          <h3 className="text-white font-bold truncate leading-tight mb-1">
            {data.title}
          </h3>
          
          <p className="text-xs text-zinc-400 mb-3">
             Stream resolved securely via proxy.
          </p>
          
          <button 
            onClick={() => onPlay(data)}
            className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-200 transition-colors w-fit"
          >
            <Play size={16} weight="fill" />
            Watch Now
          </button>
        </div>
      </div>
    </motion.div>
  );
}
