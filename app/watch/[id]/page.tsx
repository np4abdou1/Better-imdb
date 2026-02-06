'use client';
import { useState, useEffect, useRef, use, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getTitleDetails, getTitleEpisodes } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, Volume2, VolumeX, Volume1, Maximize, Minimize, 
  ArrowLeft, RotateCcw, RotateCw, 
  Loader2, ListVideo, X, ChevronRight
} from 'lucide-react';

const STREAM_API = '/api/stream/watch';
const RESOLVE_API = '/api/stream/resolve';

// --- HELPERS ---

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  return `${m}:${s < 10 ? '0' + s : s}`;
};

// Clean raw backend logs into minimal user-facing text
const sanitizeLog = (raw) => {
  if (!raw) return 'Preparing playback';
  const s = raw.replace(/\[.*?\]\s*/g, '').trim();
  const lower = s.toLowerCase();
  if (lower.includes('resolving')) return 'Locating source';
  if (lower.includes('no mapping') || lower.includes('checking')) return 'Checking availability';
  if (lower.includes('searching') || lower.includes('scanning')) return 'Searching providers';
  if (lower.includes('retry')) return 'Retrying connection';
  if (lower.includes('found') && lower.includes('results')) return 'Matching results';
  if (lower.includes('no results')) return 'Expanding search';
  if (lower.includes('fetching details') || lower.includes('validating')) return 'Validating source';
  if (lower.includes('rejecting') || lower.includes('filtering')) return 'Selecting best source';
  if (lower.includes('cached') || lower.includes('using cached')) return 'Loading cached source';
  if (lower.includes('ready') || lower.includes('play')) return 'Starting playback';
  if (lower.includes('resolving stream')) return 'Extracting stream';
  if (lower.includes('http') || lower.includes('url') || lower.includes('www')) return 'Connecting to provider';
  if (lower.includes('season') || lower.includes('episode')) return 'Locating episode';
  if (lower.includes('match')) return 'Verifying match';
  if (lower.includes('fail') || lower.includes('error')) return 'Retrying';
  // Fallback: return first 40 chars cleaned
  const clean = s.charAt(0).toUpperCase() + s.slice(1);
  return clean.length > 40 ? clean.slice(0, 40) : clean;
};

export default function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const season = searchParams.get('season') || 1;
  const episode = searchParams.get('episode') || 1;
  
  // Data
  const [title, setTitle] = useState(null);
  const [loadingTitle, setLoadingTitle] = useState(true);
  const [episodeTitle, setEpisodeTitle] = useState('');
  
  // Episodes Panel
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  
  // Stream
  const [streamUrl, setStreamUrl] = useState(null);
  const [resolving, setResolving] = useState(true);
  const [lastLog, setLastLog] = useState('');
  const [error, setError] = useState(null);
  
  // Player
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const timelineRef = useRef(null);

  
  
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [playbackFeedback, setPlaybackFeedback] = useState(null);
  const [isPaused, setIsPaused] = useState(false); // For monochrome effect
  
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  
  // Timeline Hover
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPos, setHoverPos] = useState(0);

  // Volume slider state for proper drag handling
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const volumeTimeoutRef = useRef(null);

  // --- INIT ---

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const data = await getTitleDetails(id);
        if (!data) throw new Error('Title not found');
        setTitle(data);
      } catch (err) {
        setError(err.message || 'Failed to load title');
      } finally {
        setLoadingTitle(false);
      }
    };
    fetchInfo();
  }, [id]);

  // Fetch episode title
  useEffect(() => {
    if (!title || title.type === 'movie') return;
    const fetchEpTitle = async () => {
      try {
        const data = await getTitleEpisodes(id, Number(season));
        const eps = data?.episodes || [];
        const ep = eps.find(e => String(e.episodeNumber) === String(episode));
        if (ep?.primaryTitle) setEpisodeTitle(ep.primaryTitle);
      } catch (err) {
        console.warn('Could not fetch episode title:', err);
      }
    };
    fetchEpTitle();
  }, [id, season, episode, title]);

  // SSE Stream resolve
  useEffect(() => {
    if (loadingTitle || error) return;
    setResolving(true);
    setStreamUrl(null);
    setLastLog('Preparing playback');
    
    const source = new EventSource(`${RESOLVE_API}/${id}?season=${season}&episode=${episode}`);
    source.onmessage = (event) => {
      if (event.data === '[DONE]') { source.close(); return; }
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'log') setLastLog(payload.message);
        if (payload.type === 'resolved') {
          setResolving(false);
          setStreamUrl(`${STREAM_API}/${id}?season=${season}&episode=${episode}`);
          source.close();
        }
        if (payload.type === 'error') {
          setResolving(false);
          setError(payload.message || 'Stream unavailable');
          source.close();
        }
      } catch (err) { console.error('SSE parse error:', err); }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [id, season, episode, loadingTitle]);

  // Fetch episodes for panel
  const openEpisodesPanel = useCallback(async () => {
    if (showEpisodes) { setShowEpisodes(false); return; }
    setShowEpisodes(true);
    if (episodes.length > 0) return;
    setLoadingEpisodes(true);
    try {
      const data = await getTitleEpisodes(id, Number(season));
      setEpisodes(data?.episodes || []);
    } catch (err) {
      console.warn('Failed to load episodes:', err);
    } finally {
      setLoadingEpisodes(false);
    }
  }, [showEpisodes, episodes.length, id, season]);

  // --- CONTROLS ---

  const triggerPlaybackFeedback = (type) => {
    setPlaybackFeedback(type);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setPlaybackFeedback(null), 400);
  };

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [playing]);

  useEffect(() => {
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 2500);
    } else {
      setShowControls(true);
    }
    return () => clearTimeout(controlsTimeoutRef.current);
  }, [playing]);

  const togglePlay = useCallback((e?: any) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPlaying(true);
      setIsPaused(false);
      triggerPlaybackFeedback('play');
    } else {
      video.pause();
      setPlaying(false);
      setIsPaused(true);
      triggerPlaybackFeedback('pause');
    }
  }, []);

  const seekRelative = useCallback((seconds) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), duration);
    setCurrentTime(video.currentTime);
    handleMouseMove();
  }, [duration, handleMouseMove]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch(e) { /* ignore */ }
  }, []);

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
    if (next) setVolume(0);
    else { setVolume(1); video.volume = 1; }
  }, [muted]);
  
  const handleVolumeChange = useCallback((e) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setMuted(val === 0);
    }
  }, []);

  const handleSeekClick = useCallback((e) => {
    e.stopPropagation();
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTo = pct * duration;
    if (videoRef.current) videoRef.current.currentTime = seekTo;
    setCurrentTime(seekTo);
  }, [duration]);

  const handleTimelineHover = useCallback((e) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * duration;

    setHoverTime(time);
    setHoverPos(pct * 100);
  }, [duration]);

  const handleTimelineLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  // Volume hover handlers
  const handleVolumeEnter = useCallback(() => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    setShowVolumeSlider(true);
  }, []);

  const handleVolumeLeave = useCallback(() => {
    volumeTimeoutRef.current = setTimeout(() => setShowVolumeSlider(false), 300);
  }, []);

  // Keyboard
  useEffect(() => {
    const handleKey = (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      switch(e.code) {
        case 'Space': case 'KeyK': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': case 'KeyJ': e.preventDefault(); seekRelative(-10); break;
        case 'ArrowRight': case 'KeyL': e.preventDefault(); seekRelative(10); break;
        case 'ArrowUp': 
          e.preventDefault(); 
          setVolume(v => { const n = Math.min(v + 0.1, 1); if(videoRef.current) videoRef.current.volume = n; return n; }); 
          break;
        case 'ArrowDown': 
          e.preventDefault(); 
          setVolume(v => { const n = Math.max(v - 0.1, 0); if(videoRef.current) videoRef.current.volume = n; return n; }); 
          break;
        case 'KeyF': e.preventDefault(); toggleFullscreen(); break;
        case 'KeyM': e.preventDefault(); toggleMute(); break;
        case 'Escape': 
          if (showEpisodes) setShowEpisodes(false);
          else if (fullscreen) toggleFullscreen(); 
          else router.back(); 
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [duration, playing, fullscreen, showEpisodes, togglePlay, seekRelative, toggleFullscreen, toggleMute, router]);

  // Display log
  const displayLog = useMemo(() => sanitizeLog(lastLog), [lastLog]);

  // Volume icon
  const VolumeIcon = useMemo(() => {
    if (muted || volume === 0) return VolumeX;
    if (volume < 0.5) return Volume1;
    return Volume2;
  }, [muted, volume]);

  // Is a series?
  const isSeries = title && title.type !== 'movie';

  // Build title line string
  const titleLine = useMemo(() => {
    if (!title) return '';
    if (!isSeries) return title.primaryTitle;
    const parts = [title.primaryTitle];
    parts.push(`S${season}:E${episode}`);
    if (episodeTitle) parts.push(episodeTitle);
    return parts.join(' \u00B7 ');
  }, [title, isSeries, season, episode, episodeTitle]);

  // --- RENDER ---

  if (loadingTitle) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center font-sans">
        <Loader2 className="animate-spin text-white/30 h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white space-y-5 font-sans">
        <p className="text-white/40 text-sm">{error}</p>
        <div className="flex gap-3">
          <button onClick={() => window.location.reload()} className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-md hover:bg-zinc-200 transition-colors">
            Retry
          </button>
          <button onClick={() => router.back()} className="px-5 py-2 text-white/60 hover:text-white text-sm transition-colors">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration && videoRef.current?.buffered.length 
    ? (videoRef.current.buffered.end(videoRef.current.buffered.length - 1) / duration) * 100 
    : 0;

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 w-screen h-screen bg-black overflow-hidden select-none font-sans ${playing && !showControls ? 'cursor-none' : ''}`}
      onMouseMove={handleMouseMove}
      onClick={(e) => { if (!showEpisodes) togglePlay(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
    >
      {/* Video Layer */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: streamUrl ? 1 : 0,
          scale: isPaused ? 1.02 : 1,
          filter: isPaused ? 'saturate(0.15) brightness(0.7)' : 'saturate(1) brightness(1)'
        }}
        transition={{ opacity: { duration: 0.6 }, scale: { duration: 0.5, ease: 'easeOut' }, filter: { duration: 0.5 } }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          src={streamUrl}
          autoPlay
          playsInline
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => { setWaiting(false); setPlaying(true); setIsPaused(false); }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setShowControls(true); }}
        />
      </motion.div>

      {/* Overlays */}
      <AnimatePresence mode="wait">
        {/* Buffering */}
        {waiting && !resolving && (
          <motion.div key="buffering" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <Loader2 className="w-10 h-10 text-white/40 animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play/Pause Center Feedback */}
      <AnimatePresence>
        {playbackFeedback && (
          <motion.div key={playbackFeedback}
            initial={{ opacity: 0.9, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          >
            <div className="bg-black/50 backdrop-blur-md p-5 rounded-full">
              {playbackFeedback === 'play' 
                ? <Play size={40} fill="white" stroke="none" className="ml-1" /> 
                : <Pause size={40} fill="white" stroke="none" />
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resolution Loading */}
      <AnimatePresence>
        {resolving && (
          <motion.div key="resolve" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}
            className="absolute inset-0 bg-black z-30 flex items-center justify-center"
          >
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-white/40" />
              <span className="text-[13px] text-white/40 font-medium tracking-wide">{displayLog}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <AnimatePresence>
        {showControls && !resolving && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-40 flex flex-col justify-between pointer-events-none"
          >
            {/* Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />

            {/* Top */}
            <div className="relative z-10 w-full p-6 flex items-center pointer-events-auto">
              <button onClick={(e) => { e.stopPropagation(); router.back(); }}
                className="text-white/90 hover:text-white transition-colors">
                <ArrowLeft size={28} />
              </button>
            </div>

            {/* Bottom */}
            <div className="relative z-10 w-full px-6 md:px-10 pb-8 pointer-events-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
               
              {/* Timeline */}
              <div 
                ref={timelineRef}
                className="relative w-full h-[18px] cursor-pointer group/tl flex items-center"
                onClick={handleSeekClick}
                onMouseMove={handleTimelineHover}
                onMouseLeave={handleTimelineLeave}
              >
                {/* Track */}
                <div className="absolute top-1/2 -translate-y-1/2 w-full h-[4px] bg-white/20 rounded-full group-hover/tl:h-[6px] transition-all">
                  {/* Buffer */}
                  <div className="absolute h-full bg-white/30 rounded-full transition-all" style={{ width: `${bufferedPct}%` }} />
                  {/* Progress */}
                  <div className="absolute h-full bg-white rounded-full" style={{ width: `${progressPct}%` }} />
                </div>
                
                {/* Scrubber Knob */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.4)] scale-0 group-hover/tl:scale-100 transition-transform z-10"
                  style={{ left: `calc(${progressPct}% - 7px)` }} 
                />

                {/* Hover Time */}
                {hoverTime !== null && (
                  <div
                    className="absolute bottom-full mb-3 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20"
                    style={{ left: `${hoverPos}%` }}
                  >
                    <div className="bg-black/90 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-lg">
                      {formatTime(hoverTime)}
                    </div>
                  </div>
                )}
              </div>

              {/* Title line below timeline */}
              <div className="flex items-center justify-between mt-1 mb-2 px-0.5">
                <span className="text-white/80 text-[13px] font-medium truncate max-w-[60%]">{titleLine}</span>
                <span className="text-white/40 text-xs tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between">
                
                {/* Left */}
                <div className="flex items-center gap-5">
                  <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
                    {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                  </button>
                  
                  <button onClick={(e) => { e.stopPropagation(); seekRelative(-10); }} className="relative text-white hover:text-white/80 transition-colors">
                    <RotateCcw size={22} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-[1px]">10</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); seekRelative(10); }} className="relative text-white hover:text-white/80 transition-colors">
                    <RotateCw size={22} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-[1px]">10</span>
                  </button>

                  {/* Volume */}
                  <div className="relative flex items-center gap-2"
                       onMouseEnter={handleVolumeEnter}
                       onMouseLeave={handleVolumeLeave}>
                    <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white hover:text-white/80 transition-colors">
                      <VolumeIcon size={22} />
                    </button>
                    <div className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out ${showVolumeSlider ? 'w-[80px] opacity-100' : 'w-0 opacity-0'}`}>
                      <div className="relative w-[80px] h-[20px] flex items-center">
                        {/* Track background */}
                        <div className="absolute left-0 right-0 h-[3px] bg-white/20 rounded-full" />
                        {/* Track fill */}
                        <div className="absolute left-0 h-[3px] bg-white rounded-full pointer-events-none" style={{ width: `${volume * 100}%` }} />
                        {/* Native range input on top for proper interaction */}
                        <input 
                          type="range" min="0" max="1" step="0.01" value={volume}
                          onChange={handleVolumeChange}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        {/* Visual knob */}
                        <div className="absolute h-3 w-3 bg-white rounded-full shadow-sm pointer-events-none"
                             style={{ left: `calc(${volume * 100}% - 6px)` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right */}
                <div className="flex items-center gap-4">
                  {isSeries && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); openEpisodesPanel(); }}
                      className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-medium"
                    >
                      <ListVideo size={20} />
                      <span className="hidden md:inline">Episodes</span>
                    </button>
                  )}
                  
                  <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="text-white/80 hover:text-white transition-colors">
                    {fullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Episodes Side Panel */}
      <AnimatePresence>
        {showEpisodes && isSeries && (
          <motion.div
            key="episodes-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute top-0 right-0 h-full w-[340px] md:w-[400px] bg-neutral-900/95 backdrop-blur-xl z-50 flex flex-col border-l border-white/5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-white font-semibold text-base">{title.primaryTitle}</h3>
                <p className="text-white/40 text-xs mt-0.5">Season {season}</p>
              </div>
              <button onClick={() => setShowEpisodes(false)} className="text-white/50 hover:text-white transition-colors p-1">
                <X size={20} />
              </button>
            </div>

            {/* Episode List */}
            <div className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-white/10">
              {loadingEpisodes ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
                </div>
              ) : episodes.length === 0 ? (
                <p className="text-white/30 text-sm text-center py-16">No episodes found</p>
              ) : (
                episodes.map((ep) => {
                  const isActive = String(ep.episodeNumber) === String(episode);
                  return (
                    <button
                      key={ep.id || ep.episodeNumber}
                      onClick={() => {
                        setShowEpisodes(false);
                        router.push(`/watch/${id}?season=${season}&episode=${ep.episodeNumber}`);
                      }}
                      className={`w-full text-left px-5 py-3 flex items-start gap-3 transition-colors ${
                        isActive ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <span className={`text-sm font-bold tabular-nums min-w-[24px] ${isActive ? 'text-white' : 'text-white/40'}`}>
                        {ep.episodeNumber}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/70'}`}>
                          {ep.primaryTitle || `Episode ${ep.episodeNumber}`}
                        </p>
                        {ep.plot && (
                          <p className="text-white/30 text-xs mt-0.5 line-clamp-2">{ep.plot}</p>
                        )}
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-1 text-white/60 text-xs shrink-0 mt-0.5">
                          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                          Now
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
