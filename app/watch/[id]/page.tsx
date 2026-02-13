'use client';
import { useState, useEffect, useRef, use, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getTitleDetails, getTitleEpisodes } from '@/lib/api';
import { useTorrentStream } from '@/lib/hooks/use-torrent';
import { convertSubtitles } from '@/lib/srt-converter';
import { cleanupTorrent, handleBeforeUnload } from '@/lib/cleanup-utils';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, Volume2, VolumeX, Volume1, Maximize, Minimize, 
  ArrowLeft, RotateCcw, RotateCw, 
  Loader2, ListVideo, X, ChevronRight, ChevronDown, Layers, Check, Signal, Captions,
  HardDrive, Users, Tv
} from 'lucide-react';

const RESOLVE_API = '/api/stream/resolve'; // Deprecated
const SOURCES_API = '/api/stream/sources';

export interface StreamSource {
  id: string;
  name: string;
  type: 'hls' | 'mp4' | 'p2p';
  url: string;
  quality: string;
  info?: string;
  website?: string;
  seeds?: number;
  size?: string;
  filename?: string;
  codec?: string;
  audioCodec?: string;
  infoHash?: string;
}

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

const formatSpeed = (bytes) => {
  if (!bytes || bytes === 0) return '0 KB/s';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB/s';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB/s';
};

const getInfoHashFromStreamUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/\/api\/stream\/magnet\/([a-fA-F0-9]{40})/);
  return match ? match[1] : null;
};

const hasArabicCharacters = (value?: string) => {
  if (!value) return false;
  return /[\u0600-\u06FF]/.test(value);
};

const isArabicSubtitle = (
  subtitle?: { label?: string; lang?: string },
  cueText?: string
) => {
  if (!subtitle && !cueText) return false;
  const label = subtitle?.label?.toLowerCase() || '';
  const lang = subtitle?.lang?.toLowerCase() || '';
  return (
    hasArabicCharacters(cueText) ||
    lang === 'ara' ||
    lang === 'ar' ||
    label.includes('arabic') ||
    label.includes('عرب')
  );
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
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [lastLog, setLastLog] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Sources
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [currentSource, setCurrentSource] = useState<StreamSource | null>(null);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  
  // Subtitles
  const [subtitles, setSubtitles] = useState<{label: string, fileIdx: number, src: string, lang?: string, source?: string}[]>([]);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState(-1); // -1 = off
  const [expandedLang, setExpandedLang] = useState<string | null>(null); // For grouped subtitle menu
  const [activeCueText, setActiveCueText] = useState('');
  const [audioTracks, setAudioTracks] = useState<{ index: number; label: string; language?: string; enabled: boolean }[]>([]);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  
  // Player
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const timelineRef = useRef(null);

  // Hook for Torrent Playback
  const { downloadSpeed, progress: torrentProgress, peers, status: torrentStatus, error: torrentError } = useTorrentStream(
      videoRef,
      streamUrl && streamUrl.startsWith('magnet:') ? streamUrl : null
  );

  // Server-side torrent stats polling (for /api/stream/magnet streaming)
  const [serverTorrentStats, setServerTorrentStats] = useState<any>(null);
  const pollInfoHash = useMemo(() => {
    return currentSource?.infoHash || getInfoHashFromStreamUrl(streamUrl);
  }, [currentSource?.infoHash, streamUrl]);
  
  useEffect(() => {
    if (!pollInfoHash || !streamUrl?.includes('/api/stream/magnet/')) {
      setServerTorrentStats(null);
      return;
    }

    const pollStats = async () => {
      try {
        const res = await fetch(`/api/stream/stats?infoHash=${pollInfoHash}`);
        if (res.ok) {
          const stats = await res.json();
          setServerTorrentStats(stats);
        }
      } catch (e) {
        // Silent fail on stats polling
      }
    };

    // Poll every 1 second for fresh stats
    const interval = setInterval(pollStats, 1000);
    pollStats(); // Immediate first fetch

    return () => clearInterval(interval);
  }, [pollInfoHash, streamUrl]);

  useEffect(() => {
    if (torrentError) setError(torrentError);
    if (torrentStatus) setLastLog(torrentStatus);
  }, [torrentStatus, torrentError]);

  // Track previous streamUrl to cleanup old torrent when switching
  const prevStreamUrlRef = useRef<string | null>(null);
  
  // Cleanup previous torrent when streamUrl changes (source/episode switch)
  useEffect(() => {
    const prevUrl = prevStreamUrlRef.current;
    if (prevUrl && prevUrl !== streamUrl) {
      console.log('[Cleanup] Stream URL changed, cleaning up previous torrent');
      // Await cleanup to prevent race conditions
      cleanupTorrent(prevUrl).catch(err => 
        console.error('[Cleanup] Error during cleanup:', err)
      );
    }
    prevStreamUrlRef.current = streamUrl;
  }, [streamUrl]);

  // Cleanup on component unmount (back navigation, player close)
  useEffect(() => {
    const beforeUnloadHandler = () => handleBeforeUnload(streamUrl);
    
    window.addEventListener('beforeunload', beforeUnloadHandler);
    
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      // Cleanup on SPA navigation or component unmount
      cleanupTorrent(streamUrl).catch(err => 
        console.error('[Cleanup] Error during cleanup:', err)
      );
    };
  }, [streamUrl]);

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
  const autoFallbackTriedRef = useRef<Set<string>>(new Set());

  const syncAudioTracks = useCallback(() => {
    const videoAny = videoRef.current as any;
    const tracks = videoAny?.audioTracks;

    if (!tracks || typeof tracks.length !== 'number') {
      setAudioTracks([]);
      return;
    }

    if (tracks.length > 0) {
      let hasEnabled = false;
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i]?.enabled) {
          hasEnabled = true;
          break;
        }
      }
      if (!hasEnabled && tracks[0]) {
        tracks[0].enabled = true;
      }
    }

    const parsed: { index: number; label: string; language?: string; enabled: boolean }[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      parsed.push({
        index: i,
        label: track?.label || track?.language || `Audio ${i + 1}`,
        language: track?.language || '',
        enabled: !!track?.enabled,
      });
    }

    setAudioTracks(parsed);
    const active = parsed.find((t) => t.enabled);
    if (active) setCurrentAudioTrack(active.index);
  }, []);

  const selectAudioTrack = useCallback((index: number) => {
    const videoAny = videoRef.current as any;
    const tracks = videoAny?.audioTracks;
    if (!tracks || typeof tracks.length !== 'number') return;

    for (let i = 0; i < tracks.length; i++) {
      tracks[i].enabled = i === index;
    }
    setCurrentAudioTrack(index);
    syncAudioTracks();
    setShowAudioMenu(false);
  }, [syncAudioTracks]);

  // Keep media element audio state in sync when switching sources (TopCinema <-> Torrent)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted;

    if (!muted) {
      const nextVolume = volume > 0 ? volume : 1;
      if (video.volume === 0 || Math.abs(video.volume - nextVolume) > 0.01) {
        video.volume = nextVolume;
      }
      if (volume <= 0) {
        setVolume(nextVolume);
      }
    }
  }, [muted, volume, streamUrl, currentSource?.id]);

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

  // Fetch Sources
  useEffect(() => {
    if (loadingTitle) return;
    
    setResolving(true);
    setError(null);
    setSources([]);
    setCurrentSource(null);
    setStreamUrl(null);
    setLastLog('Searching sources...');

    const fetchSources = async () => {
      try {
        const type = title?.type === 'movie' ? 'movie' : 'series';
        const query = new URLSearchParams({
           season: String(season),
           episode: String(episode),
           type
        });

        const res = await fetch(`${SOURCES_API}/${id}?${query}`);
        
        if (!res.ok) {
           setError('Failed to load sources');
           setResolving(false);
           return;
        }
        
        const data = await res.json();
        const foundSources: StreamSource[] = data.sources || [];
        setSources(foundSources);

        if (foundSources.length > 0) {
            setLastLog(`Found ${foundSources.length} sources`);
            const best = foundSources[0];
            setCurrentSource(best);
            setStreamUrl(best.url);
            setResolving(false);
        } else {
            setError('No streams found for this title.');
            setResolving(false);
        }
      } catch (err: any) {
          console.error(err);
          setError(err.message || 'Error resolving sources');
          setResolving(false);
      }
    };

    fetchSources();
  }, [id, season, episode, loadingTitle, title]); 

  const changeSource = async (source: StreamSource) => {
    // Cleanup current torrent before switching sources
    await cleanupTorrent(streamUrl);
    
    setCurrentSource(source);
    setStreamUrl(source.url);
    setShowSourceSelector(false);
    // Reset player specific stuff if needed
    setPlaying(true);
  };

  const isLikelyIncompatibleSource = useCallback((source?: StreamSource | null) => {
    if (!source) return false;
    const codec = (source.codec || '').toLowerCase();
    const audio = (source.audioCodec || '').toLowerCase();
    const file = (source.filename || '').toLowerCase();
    const info = (source.info || '').toLowerCase();

    const hasHevc = codec.includes('hevc') || file.includes('x265') || file.includes('h265') || info.includes('hevc');
    const hasAv1 = file.includes('av1') || info.includes('av1') || codec.includes('av1');
    const riskyAudio = audio.includes('eac3') || audio.includes('dts') || audio.includes('truehd');

    return hasHevc || hasAv1 || riskyAudio;
  }, []);

  const findFallbackSource = useCallback((failed?: StreamSource | null): StreamSource | null => {
    if (!failed || sources.length <= 1) return null;

    const candidates = sources.filter((s) => s.id !== failed.id);
    if (!candidates.length) return null;

    const nonRisky = candidates.find((s) => !isLikelyIncompatibleSource(s));
    if (nonRisky) return nonRisky;

    const topCinema = candidates.find((s) => s.id === 'topcinema' || s.website === 'TopCinema');
    if (topCinema) return topCinema;

    return candidates[0] || null;
  }, [sources, isLikelyIncompatibleSource]);

  const attemptAutoFallback = useCallback(async (reason: string) => {
    const current = currentSource;
    if (!current) return;

    if (autoFallbackTriedRef.current.has(current.id)) return;
    autoFallbackTriedRef.current.add(current.id);

    const fallback = findFallbackSource(current);
    if (!fallback) return;

    setLastLog(`Source issue detected (${reason}), switching source...`);
    await changeSource(fallback);
  }, [currentSource, findFallbackSource, changeSource]);

  useEffect(() => {
    autoFallbackTriedRef.current.clear();
  }, [id, season, episode]);

  useEffect(() => {
    setAudioTracks([]);
    setCurrentAudioTrack(0);
    setShowAudioMenu(false);
  }, [streamUrl, currentSource?.id]);

  useEffect(() => {
    const videoAny = videoRef.current as any;
    const tracks = videoAny?.audioTracks;
    if (!tracks || typeof tracks.length !== 'number') return;

    const onTrackChange = () => syncAudioTracks();
    try {
      tracks.addEventListener?.('change', onTrackChange);
      tracks.addEventListener?.('addtrack', onTrackChange);
      tracks.addEventListener?.('removetrack', onTrackChange);
    } catch {}

    const interval = setInterval(syncAudioTracks, 1500);
    syncAudioTracks();

    return () => {
      clearInterval(interval);
      try {
        tracks.removeEventListener?.('change', onTrackChange);
        tracks.removeEventListener?.('addtrack', onTrackChange);
        tracks.removeEventListener?.('removetrack', onTrackChange);
      } catch {}
    };
  }, [syncAudioTracks, streamUrl]);

  // Fetch Subtitles
  useEffect(() => {
    if (!id) return;
    setSubtitles([]);
    setCurrentSubtitle(-1);
    
    const isSeries_ = title && title.type !== 'movie';
    const params = new URLSearchParams({ imdbId: id });
    if (isSeries_) {
      params.append('season', String(season));
      params.append('episode', String(episode));
    }
    
    fetch(`/api/stream/subtitles?${params}`)
      .then(res => res.json())
      .then(data => {
        if (data.subtitles && data.subtitles.length > 0) {
          const mapped = data.subtitles.map((s: any, i: number) => ({
            fileIdx: 9000 + i,
            label: s.label || s.lang,
            lang: s.lang || 'unknown',
            source: 'OpenSubtitles',
            src: `/api/proxy/subtitles?url=${encodeURIComponent(s.url)}&v=2`
          }));
          setSubtitles(mapped);
          // Auto-select Arabic if available, else English
          const araIdx = mapped.findIndex((s: any) => s.label.toLowerCase().includes('arabic') || s.lang === 'ara' || s.lang === 'ar');
          const enIdx = mapped.findIndex((s: any) => s.label.toLowerCase().includes('english') || s.lang === 'eng');
          
          if (araIdx !== -1) setCurrentSubtitle(araIdx);
          else if (enIdx !== -1) setCurrentSubtitle(enIdx);
        }
      })
      .catch(e => console.error('[Subtitles] External fetch error:', e));
    
    // Also check for embedded subs if magnet source
    if (streamUrl) {
      const match = streamUrl.match(/magnet\/([a-fA-F0-9]{40})/);
      if (match) {
        const hash = match[1];
        fetch(`/api/stream/subtitles/${hash}`)
          .then(res => res.json())
          .then(data => {
            if (data.subtitles && data.subtitles.length > 0) {
              const mapped = data.subtitles.map((s: any) => ({
                ...s,
                source: 'Embedded',
                lang: s.lang || 'unknown',
                src: `/api/stream/magnet/${hash}?fileIdx=${s.fileIdx}&kind=subtitle`
              }));
              setSubtitles(prev => [...prev, ...mapped]);
            }
          })
          .catch(e => console.error('[Subtitles] Embedded fetch error:', e));
      }
    }
  }, [id, season, episode, title, streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = Array.from(video.textTracks || []) as TextTrack[];
    tracks.forEach((track, idx) => {
      // Keep track hidden so cues load but the browser doesn't render them (custom overlay handles display).
      track.mode = idx === currentSubtitle ? 'hidden' : 'disabled';
    });

    const activeTrack = currentSubtitle >= 0 ? tracks[currentSubtitle] : null;
    if (!activeTrack) {
      setActiveCueText('');
      return;
    }

    const handleCueChange = () => {
      const activeCues = activeTrack.activeCues ? Array.from(activeTrack.activeCues) : [];
      const cueText = activeCues
        .map((cue) => ('text' in cue ? (cue as VTTCue).text : ''))
        .filter(Boolean)
        .join('\n');
      setActiveCueText(cueText);
    };

    handleCueChange();
    activeTrack.addEventListener('cuechange', handleCueChange);
    return () => activeTrack.removeEventListener('cuechange', handleCueChange);
  }, [currentSubtitle, subtitles, streamUrl, duration]);

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

  const handleBack = useCallback(async () => {
    await cleanupTorrent(streamUrl);
    router.back();
  }, [router, streamUrl]);

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
          setVolume(v => {
            const n = Math.min(v + 0.1, 1);
            if (videoRef.current) {
              videoRef.current.volume = n;
              videoRef.current.muted = false;
            }
            setMuted(false);
            return n;
          }); 
          break;
        case 'ArrowDown': 
          e.preventDefault(); 
          setVolume(v => {
            const n = Math.max(v - 0.1, 0);
            if (videoRef.current) {
              videoRef.current.volume = n;
              videoRef.current.muted = n === 0;
            }
            setMuted(n === 0);
            return n;
          }); 
          break;
        case 'KeyF': e.preventDefault(); toggleFullscreen(); break;
        case 'KeyM': e.preventDefault(); toggleMute(); break;
        case 'Escape': 
          if (showEpisodes) setShowEpisodes(false);
          else if (fullscreen) toggleFullscreen(); 
          else handleBack(); 
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [duration, playing, fullscreen, showEpisodes, togglePlay, seekRelative, toggleFullscreen, toggleMute, handleBack]);

  // Display log
  const displayLog = useMemo(() => sanitizeLog(lastLog), [lastLog]);

  // Check if current stream is P2P
  const isP2P = useMemo(() => {
      return (currentSource?.type === 'p2p') || (streamUrl && streamUrl.startsWith('magnet:'));
  }, [currentSource, streamUrl]);

  const torrentInfoLine = useMemo(() => {
    if (serverTorrentStats) {
      return `Peers ${serverTorrentStats.numPeers} • Server ${formatSpeed(serverTorrentStats.downloadSpeed)} • Client ${formatSpeed(serverTorrentStats.deliveredSpeed || 0)} • ${(serverTorrentStats.progress * 100).toFixed(0)}%`;
    }

    const livePeers = peers || 0;
    const liveProgress = (torrentProgress * 100).toFixed(0);

    if (livePeers > 0 || downloadSpeed > 0 || torrentProgress > 0) {
      return `${livePeers} peers • ${formatSpeed(downloadSpeed)} • ${liveProgress}%`;
    }

    const sourceSeeds = currentSource?.seeds || 0;
    const sourceSize = currentSource?.size ? ` • ${currentSource.size}` : '';

    if (sourceSeeds > 0) {
      return `${sourceSeeds} seeds${sourceSize}`;
    }

    return currentSource?.info || 'Waiting for torrent stats';
  }, [serverTorrentStats, peers, downloadSpeed, torrentProgress, currentSource]);

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

  const activeSubtitle = useMemo(() => {
    if (currentSubtitle < 0) return null;
    return subtitles[currentSubtitle] || null;
  }, [currentSubtitle, subtitles]);

  const subtitleIsArabic = useMemo(() => {
    return isArabicSubtitle(activeSubtitle || undefined, activeCueText);
  }, [activeSubtitle, activeCueText]);

  // Group subtitles by language for the grouped menu
  const subtitleGroups = useMemo(() => {
    const groups: Record<string, typeof subtitles> = {};
    subtitles.forEach((sub) => {
      const key = sub.label || sub.lang || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(sub);
    });
    return groups;
  }, [subtitles]);

  const subtitleOffsetClass = showControls ? 'bottom-28 md:bottom-32' : 'bottom-16 md:bottom-20';
  const showSubtitleOverlay = currentSubtitle !== -1 && activeCueText.trim().length > 0;

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
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white space-y-5 font-sans z-[60]">
        <p className="text-white/40 text-sm">{error}</p>
        <div className="flex gap-3">
          {sources.length > 1 && (
              <button 
                onClick={() => { setError(null); setShowSourceSelector(true); }} // This might need a way to show selector without playing
                className="px-5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-semibold rounded-md border border-emerald-500/20 transition-colors"
              >
                Change Source
              </button>
          )}
          <button onClick={() => window.location.reload()} className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-md hover:bg-zinc-200 transition-colors">
            Retry
          </button>
          <button onClick={handleBack} className="px-5 py-2 text-white/60 hover:text-white text-sm transition-colors">
            Go Back
          </button>
        </div>
        
        {/* Source List Helper when stuck in error state */}
        {sources.length > 1 && (
            <div className="mt-8 max-h-[50vh] overflow-y-auto w-[420px] border border-white/10 rounded-xl bg-white/5 backdrop-blur-md">
                <p className="text-xs text-white/30 uppercase font-bold px-4 pt-3 pb-2 tracking-wider">Available Sources ({sources.length})</p>
                <div className="pb-2">
                {sources.map(s => (
                    <button key={s.id} onClick={() => { setError(null); changeSource(s); }} className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-t border-white/5 first:border-t-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    {s.type === 'p2p' ? (
                                        <span className="text-[8px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-bold tracking-wider shrink-0">P2P</span>
                                    ) : (
                                        <span className="text-[8px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-bold tracking-wider shrink-0">{s.type.toUpperCase()}</span>
                                    )}
                                    {s.quality && s.quality !== 'Unknown' && (
                                        <span className="text-[9px] bg-white/15 text-white/80 px-1.5 py-0.5 rounded font-bold">{s.quality}</span>
                                    )}
                                    {s.codec && (
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${s.codec === 'HEVC' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-400'}`}>{s.codec}</span>
                                    )}
                                </div>
                                <p className="text-xs text-white/80 font-medium truncate">{s.filename || s.name}</p>
                                {s.website && <p className="text-[10px] text-white/30 mt-0.5">{s.website}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                {s.size && <span className="text-[10px] text-white/50 font-mono flex items-center gap-1"><HardDrive size={10} />{s.size}</span>}
                                {(s.seeds !== undefined && s.seeds > 0) && <span className="text-[10px] text-emerald-400/80 font-mono flex items-center gap-1"><Users size={10} />{s.seeds}</span>}
                            </div>
                        </div>
                    </button>
                ))}
                </div>
            </div>
        )}
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
          key={streamUrl || 'empty-stream'}
          ref={videoRef}
          className="w-full h-full object-contain"
          src={streamUrl && !streamUrl.startsWith('magnet:') ? streamUrl : undefined}
          autoPlay
          playsInline
          onError={() => {
             attemptAutoFallback('playback-error').catch(() => {
               setError(`Playback failed for ${currentSource?.name || 'source'}`);
             });
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            setCurrentTime(v?.currentTime || 0);

            if (!v) return;
            if ((v.currentTime || 0) > 2 && (v.videoWidth || 0) === 0) {
              attemptAutoFallback('black-screen');
            }
          }}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            setDuration(video?.duration || 0);
            if (!video) return;

            video.muted = muted;
            if (!muted && video.volume === 0) {
              const nextVolume = volume > 0 ? volume : 1;
              video.volume = nextVolume;
              if (volume <= 0) setVolume(nextVolume);
            }

            window.setTimeout(() => {
              const v = videoRef.current;
              if (!v || v.paused) return;
              if ((v.videoWidth || 0) === 0 && (v.currentTime || 0) >= 0.3) {
                attemptAutoFallback('no-video-track');
              }
            }, 1200);

            syncAudioTracks();
          }}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => {
            setWaiting(false);
            setPlaying(true);
            setIsPaused(false);

            const v = videoRef.current;
            if (!v) return;
            if (!muted && v.muted) v.muted = false;
            if (!muted && v.volume === 0) {
              v.volume = volume > 0 ? volume : 1;
            }

            syncAudioTracks();
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setShowControls(true); }}
        >
          {subtitles.map((sub, idx) => (
            <track
              key={sub.fileIdx}
              kind="subtitles"
              label={sub.label}
              srcLang="en"
              src={sub.src}
            />
          ))}
        </video>
      </motion.div>

      {showSubtitleOverlay && (
        <div
          className={`absolute inset-x-0 ${subtitleOffsetClass} z-30 flex justify-center px-4 pointer-events-none transition-all duration-300 ease-out`}
        >
          <div
            className="max-w-4xl text-center text-white text-lg md:text-xl font-semibold leading-relaxed whitespace-pre-line"
            style={{
              textShadow: '0 0 4px rgba(0, 0, 0, 0.95), 0 2px 8px rgba(0, 0, 0, 0.85)',
              direction: subtitleIsArabic ? 'rtl' : 'ltr',
              unicodeBidi: subtitleIsArabic ? 'embed' : 'normal'
            }}
          >
            {activeCueText}
          </div>
        </div>
      )}

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
              <button onClick={(e) => { e.stopPropagation(); handleBack(); }}
                className="text-white/90 hover:text-white transition-colors">
                <ArrowLeft size={28} />
              </button>
            </div>

            {/* Bottom */}
            <div className="relative z-10 w-full px-6 md:px-10 pb-8 pointer-events-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
               
              {/* Timeline */}
              <div 
                ref={timelineRef}
                className="relative w-full h-[18px] cursor-pointer group/tl flex items-center rounded-full bg-white/5 backdrop-blur-sm"
                onClick={handleSeekClick}
                onMouseMove={handleTimelineHover}
                onMouseLeave={handleTimelineLeave}
              >
                {/* Track */}
                <div className="absolute top-1/2 -translate-y-1/2 w-full h-[4px] bg-white/25 rounded-full group-hover/tl:h-[6px] transition-all">
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
                <div className="flex items-center gap-2 overflow-hidden">
                   {isP2P && (
                       <div className="flex items-center gap-2">
                           <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold tracking-wider shrink-0">P2P</span>
                           <span className="text-[10px] text-white/50 font-mono tracking-wide">
                               {torrentInfoLine}
                           </span>
                       </div>
                    )}
                   <span className="text-white/80 text-[13px] font-medium truncate">{titleLine}</span>
                </div>
                <span className="text-white/40 text-xs tabular-nums shrink-0 ml-2">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between">
                
                {/* Left */}
                <div className="flex items-center gap-5">
                  <button onClick={togglePlay} className="rounded-full p-2 text-white hover:text-white/90 hover:bg-white/10 transition-colors active:scale-95">
                    {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                  </button>
                  
                  <button onClick={(e) => { e.stopPropagation(); seekRelative(-10); }} className="relative rounded-full p-2 text-white hover:text-white/90 hover:bg-white/10 transition-colors active:scale-95">
                    <RotateCcw size={22} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-[1px]">10</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); seekRelative(10); }} className="relative rounded-full p-2 text-white hover:text-white/90 hover:bg-white/10 transition-colors active:scale-95">
                    <RotateCw size={22} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-[1px]">10</span>
                  </button>

                  {/* Volume */}
                  <div className="relative flex items-center gap-2"
                       onMouseEnter={handleVolumeEnter}
                       onMouseLeave={handleVolumeLeave}>
                    <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="rounded-full p-2 text-white hover:text-white/90 hover:bg-white/10 transition-colors active:scale-95">
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

                  {audioTracks.length > 1 && (
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAudioMenu(!showAudioMenu);
                          setShowSubtitleMenu(false);
                          setShowSourceSelector(false);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                        title="Audio Tracks"
                      >
                        <Tv size={18} />
                        <span className="text-[11px] font-bold">AUDIO</span>
                      </button>

                      <AnimatePresence>
                        {showAudioMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            className="absolute bottom-full right-0 mb-3 w-64 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="p-3 border-b border-white/10 bg-white/5">
                              <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider">Audio Tracks</h4>
                            </div>
                            <div className="max-h-[240px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-white/10">
                              {audioTracks.map((track) => (
                                <button
                                  key={track.index}
                                  onClick={() => selectAudioTrack(track.index)}
                                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${currentAudioTrack === track.index ? 'text-white' : 'text-zinc-400'}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="truncate">{track.label}</span>
                                    {track.language && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 font-bold uppercase shrink-0">{track.language}</span>
                                    )}
                                  </div>
                                  {currentAudioTrack === track.index && <Check size={14} className="text-emerald-400 shrink-0" />}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  
                  {/* Subtitles / CC */}
                  <div className="relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowSubtitleMenu(!showSubtitleMenu); setShowSourceSelector(false); }}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${currentSubtitle !== -1 ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                      title="Subtitles"
                    >
                      <Captions size={20} strokeWidth={currentSubtitle !== -1 ? 2.5 : 1.5} />
                      <span className="text-[11px] font-bold">CC</span>
                    </button>

                    <AnimatePresence>
                      {showSubtitleMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="absolute bottom-full right-0 mb-3 w-64 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="p-3 border-b border-white/10 bg-white/5">
                            <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider">Subtitles</h4>
                          </div>
                          <div className="max-h-[280px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-white/10">
                            <button
                              onClick={() => { setCurrentSubtitle(-1); setShowSubtitleMenu(false); }}
                              className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${currentSubtitle === -1 ? 'text-white' : 'text-zinc-400'}`}
                            >
                              <span>Off</span>
                              {currentSubtitle === -1 && <Check size={14} className="text-emerald-400" />}
                            </button>
                            {subtitles.length === 0 ? (
                              <div className="px-4 py-3 text-xs text-white/30 italic text-center">Searching...</div>
                            ) : (
                              Object.entries(subtitleGroups).map(([lang, subs]) => {
                                const hasMultiple = subs.length > 1;
                                const isExpanded = expandedLang === lang;
                                // Check if any subtitle in this group is the active one
                                const activeSubInGroup = subs.some(sub => {
                                  const globalIdx = subtitles.findIndex(s => s.fileIdx === sub.fileIdx);
                                  return globalIdx === currentSubtitle;
                                });
                                
                                if (!hasMultiple) {
                                  // Single subtitle for this language - show directly
                                  const sub = subs[0];
                                  const globalIdx = subtitles.findIndex(s => s.fileIdx === sub.fileIdx);
                                  return (
                                    <button
                                      key={sub.fileIdx}
                                      onClick={() => { setCurrentSubtitle(globalIdx); setShowSubtitleMenu(false); }}
                                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${currentSubtitle === globalIdx ? 'text-white' : 'text-zinc-400'}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="truncate">{lang}</span>
                                        {sub.source && <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 font-bold shrink-0">{sub.source}</span>}
                                      </div>
                                      {currentSubtitle === globalIdx && <Check size={14} className="text-emerald-400 shrink-0" />}
                                    </button>
                                  );
                                }

                                // Multiple subtitles for this language - show expandable group
                                return (
                                  <div key={lang}>
                                    <button
                                      onClick={() => setExpandedLang(isExpanded ? null : lang)}
                                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${activeSubInGroup ? 'text-white' : 'text-zinc-400'}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span>{lang}</span>
                                        <span className="text-[9px] text-white/30 font-mono">{subs.length}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {activeSubInGroup && <Check size={12} className="text-emerald-400" />}
                                        <ChevronDown size={14} className={`text-white/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      </div>
                                    </button>
                                    {isExpanded && (
                                      <div className="bg-white/[0.03]">
                                        {subs.map((sub, i) => {
                                          const globalIdx = subtitles.findIndex(s => s.fileIdx === sub.fileIdx);
                                          return (
                                            <button
                                              key={sub.fileIdx}
                                              onClick={() => { setCurrentSubtitle(globalIdx); setShowSubtitleMenu(false); setExpandedLang(null); }}
                                              className={`w-full text-left pl-8 pr-4 py-2 text-xs flex items-center justify-between hover:bg-white/5 transition-colors ${currentSubtitle === globalIdx ? 'text-white' : 'text-zinc-500'}`}
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="truncate">Track {i + 1}</span>
                                                {sub.source && <span className="text-[7px] px-1 py-0.5 rounded bg-white/10 text-white/40 font-bold shrink-0">{sub.source}</span>}
                                              </div>
                                              {currentSubtitle === globalIdx && <Check size={12} className="text-emerald-400 shrink-0" />}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Source Selector */}
                  {sources.length > 0 && (
                    <div className="relative">
                       <button 
                         onClick={(e) => { e.stopPropagation(); setShowSourceSelector(!showSourceSelector); }}
                         className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-medium"
                       >
                         <Layers size={20} />
                         <span className="hidden md:inline">{currentSource?.name || 'Sources'}</span>
                       </button>

                       {showSourceSelector && (
                           <div 
                             className="absolute bottom-full right-0 mb-3 w-[30rem] max-w-[90vw] bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 flex flex-col max-h-[24rem]" 
                             onClick={e => e.stopPropagation()}
                           >
                                <div className="p-3 border-b border-white/10 bg-white/5 flex items-center gap-2">
                                    <Signal size={12} className="text-white/60" />
                                    <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider">Select Source</h4>
                                    <span className="text-[9px] text-white/30 ml-auto">{sources.length}</span>
                                </div>
                                <div className="overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-white/10">
                                    {sources.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => { changeSource(s); setShowSourceSelector(false); }}
                                            className={`w-full text-left px-3 py-2.5 flex flex-col gap-1 hover:bg-white/5 transition-colors border-b border-white/[0.04] last:border-0 ${currentSource?.id === s.id ? 'bg-white/10' : ''}`}
                                        >
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${s.type === 'p2p' ? 'bg-purple-500/20 text-purple-300' : 'bg-sky-500/20 text-sky-300'}`}>
                                                {s.type === 'p2p' ? 'P2P' : 'HLS'}
                                              </span>
                                              {s.quality && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">{s.quality}</span>}
                                              {s.codec && (
                                                <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${s.codec === 'HEVC' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>{s.codec}</span>
                                              )}
                                              {currentSource?.id === s.id && <Check size={11} className="text-emerald-400 ml-auto shrink-0" />}
                                            </div>
                                            {s.filename ? (
                                              <span className="text-[11px] text-white/75 leading-snug break-words line-clamp-2">{s.filename}</span>
                                            ) : (
                                              <span className="text-[11px] text-white/55 leading-snug break-words line-clamp-2">{s.name}</span>
                                            )}
                                            <div className="flex items-center gap-3 text-[9px] text-white/30">
                                              {s.seeds != null && <span className="flex items-center gap-0.5"><Users size={9} /> {s.seeds}</span>}
                                              {s.size && <span className="flex items-center gap-0.5"><HardDrive size={9} /> {s.size}</span>}
                                              {s.audioCodec && <span className="text-[9px] text-emerald-300/80">{s.audioCodec}</span>}
                                              {s.info && <span className="truncate">{s.info}</span>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                           </div>
                       )}
                    </div>
                  )}

                  {isSeries && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); openEpisodesPanel(); }}
                      className="flex items-center gap-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium rounded-full px-3 py-1.5"
                    >
                      <ListVideo size={20} />
                      <span className="hidden md:inline">Episodes</span>
                    </button>
                  )}
                  
                  <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="rounded-full p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors">
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
                      onClick={async () => {
                        setShowEpisodes(false);
                        // Cleanup current torrent before switching episodes
                        await cleanupTorrent(streamUrl);
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
