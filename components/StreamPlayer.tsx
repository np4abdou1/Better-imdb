'use client';

import { useState, useRef, useEffect, SyntheticEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, WarningCircle, List, Check } from '@phosphor-icons/react';
import { Title } from '@/types';
import { StreamSource } from '@/lib/torrentio'; // We need this type, or redefine

export interface StreamPlayerProps {
  title: Title;
  streamUrl?: string; // Legacy prop, ignored if resolved via sources
  initialSeason?: number;
  initialEpisode?: number;
  onClose?: () => void;
}

export default function StreamPlayer({ 
  title, 
  initialSeason = 1, 
  initialEpisode = 1, 
  onClose 
}: StreamPlayerProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [resolving, setResolving] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [season, setSeason] = useState<number>(initialSeason);
  const [episode, setEpisode] = useState<number>(initialEpisode);
  
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [currentSource, setCurrentSource] = useState<StreamSource | null>(null);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  
  const [subtitles, setSubtitles] = useState<{label: string, fileIdx: number}[]>([]); 

  const videoRef = useRef<HTMLVideoElement>(null);

  // Determine if it's a movie
  const isMovie = title.type === 'movie' || title.type === 'tvMovie';

  // Fetch Sources on Mount/Change
  useEffect(() => {
    let mounted = true;
    setResolving(true);
    setSources([]);
    setCurrentSource(null);
    setError(null);

    const fetchSources = async () => {
       try {
         const type = isMovie ? 'movie' : 'series';
         const query = new URLSearchParams({
            season: season.toString(),
            episode: episode.toString(),
            type
         });
         
         const res = await fetch(`/api/stream/sources/${title.id}?${query}`);
         if (!res.ok) throw new Error('Failed to fetch sources');
         
         const data = await res.json();
         if (mounted) {
             const foundSources = data.sources || [];
             setSources(foundSources);
             
             if (foundSources.length > 0) {
                 // Auto-select first source (usually TopCinema if available, or best Torrentio)
                 setCurrentSource(foundSources[0]);
             } else {
                 setError('No sources found for this title.');
             }
         }
       } catch (err) {
           if (mounted) setError('Failed to resolve stream sources.');
       } finally {
           if (mounted) setResolving(false);
       }
    };

    fetchSources();

    return () => { mounted = false; };
  }, [title.id, season, episode, isMovie]);

  // Video Events
  const handleError = (e: SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Video Error:', e);
    const target = e.target as HTMLVideoElement;
    const error = target.error;
    
    // If current source fails, maybe auto-try next?
    // For now just show error
    setLoading(false);
    setError(error?.message || 'Playback failed. Try another source.');
  };

  const handleLoadedData = () => {
    setLoading(false);
    if (!isPlaying) {
        videoRef.current?.play().catch(() => {});
        setIsPlaying(true);
    }
  };

  const changeSource = async (source: StreamSource) => {
      // Cleanup previous if it was magnet
      if (currentSource?.type === 'p2p' && currentSource.id.startsWith('torrentio-')) {
          const hash = currentSource.id.replace('torrentio-', '');
          try { await fetch('/api/stream/cleanup', { method: 'POST', body: JSON.stringify({ infoHash: hash }) }); } catch(e) {}
      }

      setCurrentSource(source);
      setLoading(true);
      setError(null);
      setShowSourceMenu(false);
      setIsPlaying(false);
      setSubtitles([]);
  };

  // Cleanup on unmount
  useEffect(() => {
        return () => {
            if (currentSource?.type === 'p2p' && currentSource.id.startsWith('torrentio-')) {
                const hash = currentSource.id.replace('torrentio-', '');
                navigator.sendBeacon('/api/stream/cleanup', JSON.stringify({ infoHash: hash }));
            }
        };
  }, [currentSource]);

  // Fetch Subtitles if Magnet
  useEffect(() => {
     if (currentSource?.type === 'p2p' && currentSource.id.startsWith('torrentio-')) {
         const hash = currentSource.id.replace('torrentio-', '');
         fetch(`/api/stream/subtitles/${hash}`)
            .then(res => res.json())
            .then(data => {
                if (data.subtitles) setSubtitles(data.subtitles);
            })
            .catch(err => console.error('Failed to fetch subs', err));
     }
  }, [currentSource]);

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
        <div className="mb-4 px-4 md:px-0 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-xl">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[0.35em] text-white/50">
                  {isMovie ? 'Movie' : `S${season} E${episode}`}
              </span>
              <h3 className="text-white font-medium text-lg md:text-xl line-clamp-1">
                {title.primaryTitle}
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
                {/* Source Mobile Toggle ?? */}
                {sources.length > 0 && (
                    <div className="relative">
                        <button 
                            onClick={() => setShowSourceMenu(!showSourceMenu)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium text-white border border-white/10"
                        >
                            <List size={16} />
                            <span className="hidden md:inline">
                                {currentSource ? currentSource.name : 'Sources'}
                            </span>
                        </button>

                        <AnimatePresence>
                            {showSourceMenu && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute top-full right-0 mt-2 w-64 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 flex flex-col max-h-80"
                                >
                                    <div className="p-3 border-b border-white/5 bg-white/5">
                                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Select Source</h4>
                                    </div>
                                    <div className="overflow-y-auto py-1">
                                        {sources.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => changeSource(s)}
                                                className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${currentSource?.id === s.id ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
                                            >
                                                <div className="flex flex-col max-w-[85%]">
                                                    <span className="font-medium truncate">{s.name}</span>
                                                    <span className="text-[10px] text-zinc-500 truncate">{s.info}</span>
                                                </div>
                                                {currentSource?.id === s.id && <Check size={14} className="text-emerald-400" />}
                                                {s.quality && (
                                                     <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 ml-2">
                                                         {s.quality}
                                                     </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
                
                <button 
                onClick={onClose}
                className="p-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white"
                >
                <X size={20} />
                </button>
            </div>
          </div>
        </div>

        {/* Player Container */}
        <div className="relative flex-1 bg-black rounded-2xl overflow-hidden border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.7)] group">
          
          {(loading || resolving) && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-white gap-3 bg-black">
              <div className="w-9 h-9 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">
                  {resolving ? 'Finding Sources...' : 'Connecting...'}
              </p>
            </div>
          )}

          {error && (
             <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/90 text-white gap-4 p-6 text-center">
               <div className="p-4 bg-red-500/10 rounded-full text-red-500 mb-2">
                 <WarningCircle size={48} />
               </div>
               <h4 className="text-xl font-bold">Playback Error</h4>
               <p className="text-zinc-400 max-w-md">{error}</p>
               {sources.length > 1 && (
                   <div className="flex gap-3">
                       <button
                           onClick={() => setShowSourceMenu(true)}
                           className="px-6 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium transition-colors border border-emerald-500/20"
                       >
                           Try Another Source
                       </button>
                   </div>
               )}
               <button 
                 onClick={onClose}
                 className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors border border-white/10"
               >
                 Close Player
               </button>
             </div>
          )}

          {currentSource && (
              <video
                key={currentSource.id} // Re-mount video on source change to force reload
                ref={videoRef}
                src={currentSource.url}
                className="w-full h-full object-contain"
                crossOrigin="anonymous" 
                controls
                autoPlay
                playsInline
                onLoadedData={handleLoadedData}
                onError={handleError}
                onWaiting={() => setLoading(true)}
                onPlaying={() => setLoading(false)}
              >
                {subtitles.map(sub => (
                    <track
                        key={sub.fileIdx}
                        kind="subtitles"
                        label={sub.label}
                        srcLang="en"
                        default={sub.label.includes('English')} // Auto-enable if explicitly English
                        // We reuse the magnet stream endpoint but point to the subtitle file index
                        src={`/api/stream/magnet/${currentSource.id.replace('torrentio-', '')}?fileIdx=${sub.fileIdx}`}
                    />
                ))}
              </video>
          )}
        </div>
        
        <div className="mt-4 px-4 md:px-0 text-center flex items-center justify-center gap-4">
             <p className="text-xs text-zinc-600">
               {currentSource ? `Streaming via ${currentSource.website}` : 'Select a source to begin'}
             </p>
             {currentSource?.type === 'p2p' && (
                 <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                     P2P MAGNET
                 </span>
             )}
        </div>
      </div>
    </motion.div>
  );
}
