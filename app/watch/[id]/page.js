'use client';
import { useState, useEffect, useRef, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getTitleDetails } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Volume2, VolumeX, Maximize, Minimize, 
  ArrowLeft, RotateCcw, RotateCw, Settings, AlertCircle, PictureInPicture
} from 'lucide-react';

const STREAM_API = '/api/stream/watch';
const RESOLVE_API = '/api/stream/resolve';

// Helper to format time
const formatTime = (seconds) => {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  return `${m}:${s < 10 ? '0' + s : s}`;
};

const PlayGlyph = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <polygon points="7,4 20,12 7,20" fill="currentColor" />
  </svg>
);

const PauseGlyph = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </svg>
);

export default function WatchPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Params
  const season = searchParams.get('season') || 1;
  const episode = searchParams.get('episode') || 1;
  
  // State
  const [title, setTitle] = useState(null);
  const [loadingTitle, setLoadingTitle] = useState(true);
  const [streamUrl, setStreamUrl] = useState(null);
  const [videoError, setVideoError] = useState(null);
  const [videoLoading, setVideoLoading] = useState(true); // Buffering
  const [resolving, setResolving] = useState(true);
  const [resolveLogs, setResolveLogs] = useState([]);
  const [resolveError, setResolveError] = useState(null);
  
  // Player State
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const timelineRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPos, setHoverPos] = useState(0);
  const [isPiP, setIsPiP] = useState(false);
  const controlsTimeoutRef = useRef(null);

  // Fetch Title Details
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const data = await getTitleDetails(id);
        if (!data) throw new Error('Title not found');
        setTitle(data);
      } catch (err) {
        setVideoError(err.message || 'Failed to load title');
      } finally {
        setLoadingTitle(false);
      }
    };
    fetchInfo();
  }, [id, season, episode]);

  useEffect(() => {
    if (loadingTitle || videoError) return;
    setResolving(true);
    setResolveError(null);
    setResolveLogs([]);
    setStreamUrl(null);

    const source = new EventSource(`${RESOLVE_API}/${id}?season=${season}&episode=${episode}`);

    source.onmessage = (event) => {
      if (event.data === '[DONE]') {
        source.close();
        return;
      }
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'log') {
          setResolveLogs((prev) => {
            const next = [...prev, payload.message].slice(-8);
            return next;
          });
        }
        if (payload.type === 'resolved') {
          setResolving(false);
          setStreamUrl(`${STREAM_API}/${id}?season=${season}&episode=${episode}`);
          setResolveLogs((prev) => [...prev, '[StreamService] Ready to play']
            .slice(-8));
          source.close();
        }
        if (payload.type === 'error') {
          setResolving(false);
          setResolveError(payload.message || 'Stream resolve failed');
          setVideoError(payload.message || 'Stream resolve failed');
          source.close();
        }
      } catch (err) {
        setResolving(false);
        setResolveError('Failed to parse resolve stream');
        setVideoError('Failed to parse resolve stream');
        source.close();
      }
    };

    source.onerror = () => {
      setResolving(false);
      setResolveError('Resolve connection failed');
      setVideoError('Resolve connection failed');
      source.close();
    };

    return () => source.close();
  }, [id, season, episode, loadingTitle, videoError]);

  // Request Fullscreen on first interaction if possible, or just be full window
  useEffect(() => {
    // Ensuring the body doesn't scroll
    document.body.style.overflow = 'hidden';
    return () => {
        document.body.style.overflow = 'auto';
    };
  }, []);

  // Idle Controls Hider
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2500);
  };
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    try {
      const storedVolume = localStorage.getItem('watcharr-volume');
      const storedMuted = localStorage.getItem('watcharr-muted');
      if (storedVolume !== null) {
        const parsed = Math.max(0, Math.min(1, parseFloat(storedVolume)));
        if (!Number.isNaN(parsed)) setVolume(parsed);
      }
      if (storedMuted !== null) setMuted(storedMuted === 'true');
    } catch (err) {
      console.warn('Failed to load volume settings:', err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('watcharr-volume', String(volume));
      localStorage.setItem('watcharr-muted', String(muted));
    } catch (err) {
      console.warn('Failed to persist volume settings:', err);
    }
  }, [volume, muted]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
    videoRef.current.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnter = () => setIsPiP(true);
    const handleLeave = () => setIsPiP(false);
    video.addEventListener('enterpictureinpicture', handleEnter);
    video.addEventListener('leavepictureinpicture', handleLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnter);
      video.removeEventListener('leavepictureinpicture', handleLeave);
    };
  }, [streamUrl]);

  // Video Handlers
  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = (e) => {
    if(e) e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  const handleVolumeChange = (e) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setMuted(val === 0);
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const seekTo = pct * duration;
    setCurrentTime(seekTo);
    if(videoRef.current) videoRef.current.currentTime = seekTo;
  };

  const handleTimelineHover = (e) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      setHoverTime(pct * duration);
      setHoverPos(pct * 100);
  };

  const toggleFullscreen = async (e) => {
    if(e) e.stopPropagation();
    try {
        if (!document.fullscreenElement) {
            await containerRef.current?.requestFullscreen();
            setFullscreen(true);
        } else {
            await document.exitFullscreen();
            setFullscreen(false);
        }
    } catch (e) {
        console.error('Fullscreen error:', e);
    }
  };

  const togglePiP = async (e) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.error('PiP error:', err);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return;

      switch(e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
        case 'KeyL':
          if (videoRef.current) videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, duration);
          handleMouseMove();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          if (videoRef.current) videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
          handleMouseMove();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(prev => {
              const newVol = Math.min(prev + 0.1, 1);
              if (videoRef.current) videoRef.current.volume = newVol;
              return newVol;
          });
          handleMouseMove();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(prev => {
              const newVol = Math.max(prev - 0.1, 0);
              if (videoRef.current) videoRef.current.volume = newVol;
              return newVol;
          });
          handleMouseMove();
          break;
        case 'KeyF':
          toggleFullscreen();
          break;
        case 'KeyM':
          toggleMute();
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [playing, volume, duration]);

  // Sync state with video events
  const onTimeUpdate = () => {
      if(videoRef.current) {
          setCurrentTime(videoRef.current.currentTime);
          // Update buffer
          if (videoRef.current.buffered.length > 0) {
              const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
              setBuffered(bufferedEnd);
          }
      }
  };
  const onLoadedMetadata = () => {
      if(videoRef.current) setDuration(videoRef.current.duration);
  };

  const jumpBack = (e) => {
    e.stopPropagation();
    if(videoRef.current) videoRef.current.currentTime -= 10;
  };

  const jumpForward = (e) => {
    e.stopPropagation();
    if(videoRef.current) videoRef.current.currentTime += 10;
  };

  // ----- RENDER -----

  if (loadingTitle) {
    return (
      <div className="fixed inset-0 bg-[#000000] z-[100] flex flex-col items-center justify-center text-white gap-4 font-mono tracking-widest">
        <div className="text-xs uppercase text-white/60">Loading title</div>
        <div className="h-px w-32 bg-white/20" />
      </div>
    );
  }

  if (videoError && !streamUrl) {
    return (
      <div className="fixed inset-0 bg-[#000000] z-[100] flex flex-col items-center justify-center text-white p-8 text-center space-y-6 font-mono">
        <div className="p-6 bg-white/10 rounded-full">
           <AlertCircle size={64} className="text-white" />
        </div>
        <div className="space-y-2">
            <h1 className="text-3xl font-bold">Unable to Load Title</h1>
            <p className="text-zinc-400 max-w-md mx-auto">{resolveError || videoError}</p>
        </div>
        <button 
          onClick={() => router.back()}
          className="px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition-transform"
        >
          Go Back
        </button>
      </div>
    );
  }

  const progressPercent = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const bufferedPercent = duration ? Math.min(100, Math.max(0, (buffered / duration) * 100)) : 0;

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 w-full h-full bg-black z-[100] overflow-hidden group select-none font-mono ${playing && !showControls ? 'cursor-none' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      onDoubleClick={toggleFullscreen}
      onClick={togglePlay} // Clicking anywhere on the screen toggles play
    >
      {/* Video Layer */}
      <video
        ref={videoRef}
        src={streamUrl}
        className="w-full h-full object-contain pointer-events-none" // Pointer events handled by parent div
        autoPlay
        playsInline
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onWaiting={() => setVideoLoading(true)}
        onPlaying={() => {
            setVideoLoading(false);
            setPlaying(true);
          handleMouseMove();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
            setPlaying(false);
            setShowControls(true);
        }}
      />

      {/* Resolve Log Overlay */}
      <AnimatePresence>
        {resolving && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          >
            <div className="watch-log-panel">
              <div className="watch-log-title">EXTRACTING STREAM</div>
              <div className="watch-log-body">
                {(resolveLogs.length ? resolveLogs : ['[StreamService] Starting resolver...']).map((line, index) => (
                  <div key={`${line}-${index}`} className="watch-log-line">
                    {line}
                  </div>
                ))}
                <div className="watch-log-caret" />
              </div>
              <div className="watch-log-scanline" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buffering Text */}
      <AnimatePresence>
        {videoLoading && !resolving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/70 animate-pulse">
              Buffering
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none"
          >
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50 pointer-events-none" />

            {/* Top Rail */}
            <div className="relative z-30 flex items-start justify-between p-6 pointer-events-auto">
              <div className="flex flex-col items-start gap-4">
                <button 
                  onClick={(e) => { e.stopPropagation(); router.back(); }}
                  className="group flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white transition-all hover:bg-white/10"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="h-8 w-px bg-white/20" />
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] uppercase tracking-[0.4em] text-white/60">Now Playing</div>
                  <div className="text-lg md:text-xl font-semibold tracking-tight text-white/90">
                    {title.primaryTitle}
                  </div>
                  {(title.type === 'tvSeries' || title.type === 'tvMiniSeries') && (
                    <div className="text-[11px] uppercase tracking-[0.3em] text-white/60">
                      Season {season} · Episode {episode}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Center Play Glyph */}
            <div className="relative z-30 flex-grow flex items-center justify-center pointer-events-none">
                {!playing && !videoLoading && (
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="pointer-events-none"
                    >
                  <div className="h-20 w-20 rounded-full border border-white/10 bg-white/5 p-5">
                    <PlayGlyph className="h-full w-full text-white" />
                  </div>
                    </motion.div>
                )}
            </div>

            {/* Bottom Controls */}
            <div className="relative z-30 flex flex-col gap-4 w-full max-w-[1100px] mx-auto pb-10 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
               
               {/* Progress Bar Container */}
               <div 
                 ref={timelineRef}
                 className="group/timeline w-full h-7 flex items-center cursor-pointer relative" 
                 onClick={handleSeek}
                 onMouseMove={handleTimelineHover}
                 onMouseLeave={() => setHoverTime(null)}
               >
                  {/* Background Track */}
                  <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden relative transition-all duration-200 group-hover/timeline:h-1.5">
                    {/* Buffer Bar */}
                    <div 
                      className="absolute h-full bg-white/25"
                      style={{ width: `${bufferedPercent}%` }}
                    />
                    {/* Playhead */}
                    <div 
                      className="h-full bg-white relative z-10"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  
                  {hoverTime !== null && (
                    <div 
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white/60 rounded-full pointer-events-none z-20"
                      style={{ left: `${hoverPos}%` }}
                    />
                  )}
                  <div 
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg scale-0 group-hover/timeline:scale-100 transition-transform pointer-events-none z-20"
                    style={{ left: `${progressPercent}%` }}
                  />

                  {hoverTime !== null && (
                    <div 
                      className="absolute bottom-full mb-3 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded border border-white/10 pointer-events-none whitespace-nowrap"
                      style={{ left: `${hoverPos}%` }}
                    >
                      {formatTime(hoverTime)}
                    </div>
                  )}
               </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-1 items-center justify-between rounded-[28px] border border-white/10 bg-black/40 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={togglePlay} 
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-transform hover:scale-105 active:scale-95"
                    >
                      {playing ? (
                        <PauseGlyph className="h-5 w-5" />
                      ) : (
                        <PlayGlyph className="h-5 w-5" />
                      )}
                    </button>
                    
                    <div className="hidden md:flex items-center gap-3 text-white/70">
                      <button onClick={jumpBack} className="hover:text-white transition-colors">
                        <RotateCcw size={18} />
                      </button>
                      <button onClick={jumpForward} className="hover:text-white transition-colors">
                        <RotateCw size={18} />
                      </button>
                    </div>

                    <div className="relative group/volume flex items-center justify-center w-7 h-7">
                      <button onClick={toggleMute} className="text-white/80 hover:text-white z-10 relative">
                        {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-4 opacity-0 group-hover/volume:opacity-100 transition-opacity duration-200 flex flex-col items-center pointer-events-none group-hover/volume:pointer-events-auto">
                        <div className="w-8 h-32 bg-[#181818]/95 rounded-full border border-white/10 flex items-center justify-center p-2 relative shadow-xl">
                          <input
                            type="range" min="0" max="1" step="0.05"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="range-vertical w-full h-full cursor-pointer appearance-none bg-transparent"
                            style={{
                              writingMode: 'bt-lr',
                              WebkitAppearance: 'slider-vertical',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] uppercase tracking-[0.35em] text-white/60">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-black/40 px-4 py-3">
                  <button
                    onClick={togglePiP}
                    className={`text-white/70 hover:text-white transition-all ${isPiP ? 'text-white' : ''}`}
                    title="Picture in Picture"
                  >
                    <PictureInPicture size={18} />
                  </button>
                  <button className="text-white/70 hover:text-white transition-all" title="Settings">
                    <Settings size={18} />
                  </button>
                  <button onClick={toggleFullscreen} className="text-white hover:text-white/80 transition-all">
                    {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
