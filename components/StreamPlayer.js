'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, WarningCircle } from '@phosphor-icons/react';

export default function StreamPlayer({ imdbId, season = 1, episode = 1, type = 'movie', title, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  // Construct the proxy URL
  // api/stream/watch/[id]?season=x&episode=y
  const streamUrl = `/api/stream/watch/${imdbId}?season=${type === 'movie' ? 1 : season}&episode=${type === 'movie' ? 1 : episode}`;

  useEffect(() => {
    // Reset state when inputs change
    setLoading(true);
    setError(null);
    setIsPlaying(false);
  }, [imdbId, season, episode]);

  const handleError = (e) => {
    console.error('Video Error:', e);
    // Determine user friendly message
    const videoError = videoRef.current?.error;
    let msg = 'Stream unavailable. Please try again later.';
    
    if (videoError) {
        if (videoError.code === 3) msg = "Playback decoding error.";
        if (videoError.code === 4) msg = "Source not supported or unavailable (404/403).";
    }
    
    setLoading(false);
    setError(msg);
  };

  const handleLoadedData = () => {
    setLoading(false);
    if (!isPlaying) {
        videoRef.current?.play().catch(e => console.log('Autoplay prevented:', e));
        setIsPlaying(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl"
      onClick={onClose}
    >
      <div 
        className="w-full h-full max-w-7xl max-h-screen md:p-8 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 px-4 md:px-0">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-xl">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[0.35em] text-white/50">Now Playing</span>
              <h3 className="text-white font-medium text-lg md:text-xl line-clamp-1">
                {title}
              </h3>
              {type !== 'movie' && (
                  <span className="text-zinc-400 text-xs uppercase tracking-[0.3em]">Season {season} · Episode {episode}</span>
              )}
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Player Container */}
        <div className="relative flex-1 bg-black rounded-2xl overflow-hidden border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.7)]">
          
          {loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-white gap-3">
              <div className="w-9 h-9 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">Resolving Stream</p>
            </div>
          )}

          {error && (
             <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/80 text-white gap-4 p-6 text-center">
               <div className="p-4 bg-red-500/10 rounded-full text-red-500 mb-2">
                 <WarningCircle size={48} />
               </div>
               <h4 className="text-xl font-bold">Playback Error</h4>
               <p className="text-zinc-400 max-w-md">{error}</p>
               <button 
                 onClick={onClose}
                 className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors border border-white/10"
               >
                 Close Player
               </button>
             </div>
          )}

          <video
            ref={videoRef}
            src={streamUrl}
            className="w-full h-full object-contain"
            controls
            autoPlay
            playsInline
            onLoadedData={handleLoadedData}
            onError={handleError}
            onWaiting={() => setLoading(true)}
            onPlaying={() => setLoading(false)}
          />
        </div>
        
        <div className="mt-4 px-4 md:px-0 text-center">
             <p className="text-xs text-zinc-600">
               Powered by TopCinema API &bull; Streamed via Secure Proxy
             </p>
        </div>
      </div>
    </motion.div>
  );
}
