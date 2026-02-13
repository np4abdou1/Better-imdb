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
  HardDrive, Users, Tv, FileVideo, Headphones, Globe, Zap, Info
} from 'lucide-react';

const SOURCES_API = '/api/stream/sources';

// --- Track types from ffprobe API ---
interface ProbeTrack {
  index: number;
  trackIndex: number;
  type: 'audio' | 'subtitle';
  codec: string;
  codecLong?: string;
  language?: string;
  title?: string;
  channels?: number;
  channelLayout?: string;
  sampleRate?: number;
  bitRate?: number;
  isDefault?: boolean;
  isForced?: boolean;
}

interface ProbeData {
  audio: ProbeTrack[];
  subtitle: ProbeTrack[];
  video: { codec?: string; width?: number; height?: number; fps?: string; bitRate?: number } | null;
  filename: string;
  fileSize: number;
  duration?: number;
}

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
  audioLanguages?: string[];
  audioMode?: string;
  infoHash?: string;
}

// --- HELPERS ---

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  return `${m}:${s < 10 ? '0' + s : s}`;
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' GB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' TB';
};

const formatDuration = (seconds?: number) => {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

const getLangLabel = (code?: string) => {
  if (!code) return 'Unknown';
  const map: Record<string, string> = {
    eng: 'English', en: 'English', jpn: 'Japanese', ja: 'Japanese',
    ara: 'Arabic', ar: 'Arabic', spa: 'Spanish', es: 'Spanish',
    fre: 'French', fr: 'French', ger: 'German', de: 'German',
    ita: 'Italian', it: 'Italian', por: 'Portuguese', pt: 'Portuguese',
    rus: 'Russian', ru: 'Russian', kor: 'Korean', ko: 'Korean',
    chi: 'Chinese', zh: 'Chinese', hin: 'Hindi', hi: 'Hindi',
    tur: 'Turkish', tr: 'Turkish', dut: 'Dutch', nl: 'Dutch',
    swe: 'Swedish', sv: 'Swedish', pol: 'Polish', pl: 'Polish',
    und: 'Undetermined',
  };
  return map[code.toLowerCase()] || code.toUpperCase();
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
  const [subtitles, setSubtitles] = useState<{label: string, fileIdx: number, src: string, lang?: string, source?: string, provider?: string}[]>([]);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState(-1); // -1 = off
  const [expandedLang, setExpandedLang] = useState<string | null>(null); // For grouped subtitle menu
  const [activeCueText, setActiveCueText] = useState('');
  const [audioTracks, setAudioTracks] = useState<{ index: number; label: string; language?: string; enabled: boolean }[]>([]);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  
  // FFprobe data for current P2P source
  const [probeData, setProbeData] = useState<ProbeData | null>(null);
  const [probePending, setProbePending] = useState(false);
  
  // Torrent preview (show before playing P2P sources)
  const [showTorrentPreview, setShowTorrentPreview] = useState(false);
  const [pendingP2PSource, setPendingP2PSource] = useState<StreamSource | null>(null);
  
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
  const audioCompatSwitchTriedRef = useRef<Set<string>>(new Set());
  const probeAutoTriedRef = useRef<Set<string>>(new Set());
  const autoTranscodeTriedRef = useRef<Set<string>>(new Set());

  const lastSyncTimeRef = useRef(0);

  const safeDuration = useMemo(() => {
    if (Number.isFinite(duration) && duration > 0) return duration;
    if (probeData?.duration && Number.isFinite(probeData.duration)) return probeData.duration;
    return 0;
  }, [duration, probeData?.duration]);

  const syncAudioTracks = useCallback(() => {
    // Prevent syncing if we just manually switched tracks (gives browser time to update)
    if (Date.now() - lastSyncTimeRef.current < 2000) return;

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
      // If none enabled, try to enable the first one (often fixes mute on start)
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
    // For P2P streams with ffprobe data: use server-side transcoding
    const isP2PStream = currentSource?.type === 'p2p' || (streamUrl && streamUrl.includes('/api/stream/magnet/'));
    
    if (isP2PStream && streamUrl && streamUrl.includes('/api/stream/magnet/')) {
        const baseUrl = streamUrl.split('?')[0];
        const currentParams = new URLSearchParams(streamUrl.split('?')[1] || '');
        const fileIdx = currentParams.get('fileIdx') || '0';
        
        const newUrl = `${baseUrl}?fileIdx=${fileIdx}&transcode=1&audioIdx=${index}`;
        setLastLog(`Switching to Audio Track ${index + 1} (Transcoding)...`);
        setStreamUrl(newUrl);
        setCurrentAudioTrack(index);
        setShowAudioMenu(false);
        return;
    }

    // Fallback: native browser track switching for non-P2P
    const videoAny = videoRef.current as any;
    const tracks = videoAny?.audioTracks;
    if (!tracks || typeof tracks.length !== 'number') return;

    for (let i = 0; i < tracks.length; i++) {
       if (i !== index) tracks[i].enabled = false;
    }
    if (tracks[index]) tracks[index].enabled = true;

    setCurrentAudioTrack(index);
    lastSyncTimeRef.current = Date.now();
    
    setTimeout(() => {
       lastSyncTimeRef.current = 0;
       syncAudioTracks();
    }, 2100);

    setShowAudioMenu(false);
  }, [syncAudioTracks, currentSource, streamUrl]);

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

  // Fetch Sources — auto-play TopCinema, show preview for P2P
  useEffect(() => {
    if (loadingTitle) return;
    
    setResolving(true);
    setError(null);
    setSources([]);
    setCurrentSource(null);
    setStreamUrl(null);
    setLastLog('Searching sources...');
    setShowTorrentPreview(false);
    setPendingP2PSource(null);
    setProbeData(null);

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
            
            // Auto-play logic: prefer TopCinema (direct streaming) 
            const topCinemaSource = foundSources.find(s => s.id === 'topcinema' || s.website === 'TopCinema');
            const p2pSources = foundSources.filter(s => s.type === 'p2p');
            
            if (topCinemaSource) {
                // Auto-play TopCinema immediately
                setCurrentSource(topCinemaSource);
                setStreamUrl(topCinemaSource.url);
                setResolving(false);
            } else if (p2pSources.length > 0) {
                // Show torrent preview for the best P2P source (don't auto-play)
                const best = p2pSources[0];
                setPendingP2PSource(best);
                setCurrentSource(best);
                setShowTorrentPreview(true);
                setResolving(false);
                
                // Start probing the best source for track info
                if (best.infoHash) {
                    const fileIdx = best.url.match(/fileIdx=(\d+)/)?.[1] || '0';
                    fetchProbeData(best.infoHash, fileIdx);
                }
            } else {
                setError('No streams found for this title.');
                setResolving(false);
            }
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

  // Fetch ffprobe data for P2P sources
  const fetchProbeData = useCallback(async (infoHash: string, fileIdx: string = '0') => {
    setProbePending(true);
    try {
      const res = await fetch(`/api/stream/tracks/${infoHash}?fileIdx=${fileIdx}`);
      if (res.ok) {
        const data: ProbeData = await res.json();
        setProbeData(data);
      }
    } catch (e) {
      console.warn('[Probe] Failed to fetch track info:', e);
    } finally {
      setProbePending(false);
    }
  }, []);
  
  // Start playing a P2P source (from torrent preview or source selector)
  const playP2PSource = useCallback(async (source: StreamSource) => {
    await cleanupTorrent(streamUrl);
    setShowTorrentPreview(false);
    setPendingP2PSource(null);
    setCurrentSource(source);
    setStreamUrl(source.url);
    setPlaying(true);
    
    // Probe tracks if not already probed for this source
    if (source.infoHash && (!probeData || probeData.filename !== source.filename)) {
      const fileIdx = source.url.match(/fileIdx=(\d+)/)?.[1] || '0';
      fetchProbeData(source.infoHash, fileIdx);
    }
  }, [streamUrl, probeData, fetchProbeData]);

  const changeSource = async (source: StreamSource) => {
    // Cleanup current torrent before switching sources
    await cleanupTorrent(streamUrl);
    
    if (source.type === 'p2p') {
      // For P2P: show preview first instead of auto-playing
      setPendingP2PSource(source);
      setCurrentSource(source);
      setShowTorrentPreview(true);
      setStreamUrl(null);
      setShowSourceSelector(false);
      
      // Start probing
      if (source.infoHash) {
        const fileIdx = source.url.match(/fileIdx=(\d+)/)?.[1] || '0';
        fetchProbeData(source.infoHash, fileIdx);
      }
    } else {
      // For HLS/MP4: play immediately
      setShowTorrentPreview(false);
      setPendingP2PSource(null);
      setCurrentSource(source);
      setStreamUrl(source.url);
      setShowSourceSelector(false);
      setPlaying(true);
    }
  };

  // If a P2P stream starts playing directly, ensure we probe tracks.
  useEffect(() => {
    if (!streamUrl || !streamUrl.includes('/api/stream/magnet/')) return;
    const infoHash = getInfoHashFromStreamUrl(streamUrl);
    if (!infoHash) return;

    const fileIdx = streamUrl.match(/fileIdx=(\d+)/)?.[1] || '0';
    const key = `${infoHash}:${fileIdx}`;

    if (probeAutoTriedRef.current.has(key)) return;
    if (probePending) return;

    const sameFile = probeData?.filename && currentSource?.filename
      ? probeData.filename === currentSource.filename
      : false;

    if (sameFile) return;

    probeAutoTriedRef.current.add(key);
    fetchProbeData(infoHash, fileIdx);
  }, [streamUrl, currentSource?.filename, probeData, fetchProbeData, probePending]);

  const isLikelyIncompatibleSource = useCallback((source?: StreamSource | null) => {
    if (!source) return false;
    const codec = (source.codec || '').toLowerCase();
    const audio = (source.audioCodec || '').toLowerCase();
    const file = (source.filename || '').toLowerCase();
    const info = (source.info || '').toLowerCase();

    const hasHevc = codec.includes('hevc') || file.includes('x265') || file.includes('h265') || info.includes('hevc');
    const hasAv1 = file.includes('av1') || info.includes('av1') || codec.includes('av1');
    const riskyAudio = audio.includes('eac3') || audio.includes('dts') || audio.includes('truehd') || audio === 'multi';

    return hasHevc || hasAv1 || riskyAudio;
  }, []);

  const isRiskyAudioCodec = useCallback((codec?: string) => {
    if (!codec) return false;
    const value = codec.toLowerCase();
    return value.includes('eac3') || value.includes('dts') || value.includes('truehd') || value.includes('ddp') || value === 'multi';
  }, []);

  const scoreAudioCompatibility = useCallback((source: StreamSource, baseline?: StreamSource | null) => {
    const codec = (source.audioCodec || '').toLowerCase();
    let score = 0;

    if (codec.includes('aac')) score += 1400;
    else if (codec.includes('opus')) score += 1200;
    else if (codec.includes('ac3')) score += 300;
    else if (codec.includes('eac3') || codec.includes('ddp')) score -= 900;
    else if (codec.includes('dts')) score -= 1300;
    else if (codec.includes('truehd')) score -= 1600;
    else score += 100;

    score += Math.min(800, source.seeds || 0);

    if (baseline?.quality && source.quality === baseline.quality) score += 400;
    if (baseline?.infoHash && source.infoHash === baseline.infoHash) score += 300;

    return score;
  }, []);

  const pickBestCompatibleAudioSource = useCallback((current?: StreamSource | null): StreamSource | null => {
    if (!current) return null;

    const p2pSources = sources.filter((s) => s.type === 'p2p' && s.id !== current.id);
    if (!p2pSources.length) return null;

    const preferredPool = p2pSources.filter((s) => {
      const sameHash = current.infoHash && s.infoHash === current.infoHash;
      const sameQuality = current.quality && s.quality === current.quality;
      return sameHash || sameQuality;
    });

    const pool = preferredPool.length ? preferredPool : p2pSources;
    const scored = pool
      .map((candidate) => ({ candidate, score: scoreAudioCompatibility(candidate, current) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.candidate || null;
    if (!best) return null;

    const currentScore = scoreAudioCompatibility(current, current);
    const bestScore = scoreAudioCompatibility(best, current);

    if (bestScore <= currentScore) return null;
    return best;
  }, [sources, scoreAudioCompatibility]);

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
    audioCompatSwitchTriedRef.current.clear();
    probeAutoTriedRef.current.clear();
    autoTranscodeTriedRef.current.clear();
  }, [id, season, episode]);

  useEffect(() => {
    const currentIsP2P = currentSource?.type === 'p2p'
      || !!(streamUrl && (streamUrl.startsWith('magnet:') || streamUrl.includes('/api/stream/magnet/')));
    if (!currentIsP2P || !currentSource) return;

    const sourceId = currentSource.id;
    if (audioCompatSwitchTriedRef.current.has(sourceId)) return;

    if (!isRiskyAudioCodec(currentSource.audioCodec)) return;

    const compatible = pickBestCompatibleAudioSource(currentSource);
    if (!compatible) return;

    audioCompatSwitchTriedRef.current.add(sourceId);
    setLastLog(`Switching to compatible audio source (${compatible.audioCodec || 'AAC'})...`);
    changeSource(compatible).catch(() => {});
  }, [currentSource, streamUrl, isRiskyAudioCodec, pickBestCompatibleAudioSource]);

  // Auto-transcode risky audio on P2P playback to avoid silent tracks.
  useEffect(() => {
    if (!streamUrl || !streamUrl.includes('/api/stream/magnet/')) return;
    if (streamUrl.includes('transcode=1')) return;

    const infoHash = getInfoHashFromStreamUrl(streamUrl);
    if (!infoHash) return;

    const fileIdx = streamUrl.match(/fileIdx=(\d+)/)?.[1] || '0';
    const key = `${infoHash}:${fileIdx}`;
    if (autoTranscodeTriedRef.current.has(key)) return;

    const riskySource = isRiskyAudioCodec(currentSource?.audioCodec);
    const riskyTrack = (probeData?.audio || []).some((t) => isRiskyAudioCodec(t.codec));
    if (!riskySource && !riskyTrack) return;

    const preferredTrack = probeData?.audio.find((t) => t.isDefault) || probeData?.audio[0];
    const audioIdx = preferredTrack?.trackIndex ?? 0;
    const baseUrl = streamUrl.split('?')[0];
    const newUrl = `${baseUrl}?fileIdx=${fileIdx}&transcode=1&audioIdx=${audioIdx}`;

    autoTranscodeTriedRef.current.add(key);
    setLastLog('Transcoding audio for compatibility...');
    setStreamUrl(newUrl);
    setCurrentAudioTrack(audioIdx);
  }, [streamUrl, currentSource?.audioCodec, probeData, isRiskyAudioCodec]);

  useEffect(() => {
    setAudioTracks([]);
    setCurrentAudioTrack(0);
    setShowAudioMenu(false);
    // Reset probe data when source changes (will be re-fetched for new source)
    if (!showTorrentPreview) {
      setProbeData(null);
    }
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

  // Fetch Subtitles (multi-provider + embedded)
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
    
    // Fetch from multi-provider API (OpenSubtitles + SubSource + SubDL)
    fetch(`/api/stream/subtitles?${params}`)
      .then(res => res.json())
      .then(data => {
        if (data.subtitles && data.subtitles.length > 0) {
          const mapped = data.subtitles.map((s: any, i: number) => ({
            fileIdx: 9000 + i,
            label: s.label || s.lang,
            lang: s.lang || 'unknown',
            source: s.provider || 'External',
            provider: s.provider || 'External',
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
    
    // Also check for sidecar subtitle files in torrent
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
                source: 'Sidecar',
                provider: 'Sidecar',
                lang: s.lang || 'unknown',
                src: `/api/stream/magnet/${hash}?fileIdx=${s.fileIdx}&kind=subtitle`
              }));
              setSubtitles(prev => [...prev, ...mapped]);
            }
          })
          .catch(e => console.error('[Subtitles] Sidecar fetch error:', e));
      }
    }
  }, [id, season, episode, title, streamUrl]);

  // Add embedded subtitle tracks from ffprobe detection
  useEffect(() => {
    if (!probeData || !probeData.subtitle.length) return;
    const infoHash = currentSource?.infoHash || getInfoHashFromStreamUrl(streamUrl);
    if (!infoHash) return;
    
    const fileIdx = streamUrl?.match(/fileIdx=(\d+)/)?.[1] || '0';
    
    // Only process text-based subtitles (skip PGS/VobSub bitmap subs)
    const textSubs = probeData.subtitle.filter(t => {
      const codec = (t.codec || '').toLowerCase();
      return !['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'pgs', 'vobsub'].includes(codec);
    });
    
    if (textSubs.length === 0) return;
    
    const embeddedSubs = textSubs.map((track, i) => ({
      fileIdx: 8000 + track.trackIndex,
      label: track.title || `${getLangLabel(track.language)} ${track.isForced ? '(Forced)' : ''}`.trim(),
      lang: track.language || 'unknown',
      source: 'Embedded',
      provider: 'Embedded',
      src: `/api/stream/subtitle-extract/${infoHash}?fileIdx=${fileIdx}&trackIdx=${track.trackIndex}`
    }));
    
    setSubtitles(prev => {
      // Remove old embedded subs then add new ones
      const filtered = prev.filter(s => s.provider !== 'Embedded');
      return [...embeddedSubs, ...filtered];
    });
  }, [probeData, currentSource?.infoHash, streamUrl]);

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
    if (!safeDuration) return;
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), safeDuration);
    setCurrentTime(video.currentTime);
    handleMouseMove();
  }, [safeDuration, handleMouseMove]);

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
    if (!timelineRef.current || !safeDuration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTo = pct * safeDuration;
    if (videoRef.current) videoRef.current.currentTime = seekTo;
    setCurrentTime(seekTo);
  }, [safeDuration]);

  const handleTimelineHover = useCallback((e) => {
    if (!timelineRef.current || !safeDuration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * safeDuration;

    setHoverTime(time);
    setHoverPos(pct * 100);
  }, [safeDuration]);

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
      return (currentSource?.type === 'p2p')
        || (streamUrl && (streamUrl.startsWith('magnet:') || streamUrl.includes('/api/stream/magnet/')));
  }, [currentSource, streamUrl]);

  const relatedAudioVariants = useMemo(() => {
    if (!currentSource || !sources.length) return [] as StreamSource[];

    const currentHash = currentSource.infoHash;
    const p2pSources = sources.filter((s) => s.type === 'p2p');
    if (!p2pSources.length) return [] as StreamSource[];

    const baseSet = currentHash
      ? p2pSources.filter((s) => s.infoHash === currentHash)
      : p2pSources.filter((s) => s.quality === currentSource.quality);

    const uniq = new Map<string, StreamSource>();
    for (const variant of baseSet) {
      uniq.set(variant.id, variant);
    }

    return Array.from(uniq.values());
  }, [currentSource, sources]);

  const showAudioControl = useMemo(() => {
    if (!isP2P) return false;
    // Show if ffprobe found multiple audio tracks
    if (probeData && probeData.audio.length > 1) return true;
    if (audioTracks.length > 0) return true;
    if (relatedAudioVariants.length > 1) return true;
    
    // Check for metadata languages
    if (currentSource?.audioLanguages && currentSource.audioLanguages.length > 0) return true;
    
    const info = `${currentSource?.filename || ''} ${currentSource?.info || ''}`.toLowerCase();
    return /dual[-\s]?audio|multi[-\s]?audio|multiple\s+audio/.test(info);
  }, [isP2P, probeData, audioTracks.length, relatedAudioVariants.length, currentSource]);

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

  // Group subtitles by provider for structured menu
  const subtitleGroups = useMemo(() => {
    const groups: Record<string, typeof subtitles> = {};
    subtitles.forEach((sub) => {
      const key = sub.provider || sub.source || 'Other';
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

  const progressPct = safeDuration ? (currentTime / safeDuration) * 100 : 0;
  const bufferedPct = safeDuration && videoRef.current?.buffered.length 
    ? (videoRef.current.buffered.end(videoRef.current.buffered.length - 1) / safeDuration) * 100 
    : 0;
  const timelineDisabled = !safeDuration;

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

            if (v?.duration && Number.isFinite(v.duration) && v.duration > 0) {
              if (!Number.isFinite(duration) || Math.abs(v.duration - duration) > 0.5) {
                setDuration(v.duration);
              }
            }

            if (!v) return;
            if ((v.currentTime || 0) > 2 && (v.videoWidth || 0) === 0) {
              attemptAutoFallback('black-screen');
            }
          }}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            const nextDuration = video?.duration || 0;
            if (Number.isFinite(nextDuration) && nextDuration > 0) {
              setDuration(nextDuration);
            }
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
          onDurationChange={() => {
            const v = videoRef.current;
            if (!v) return;
            if (Number.isFinite(v.duration) && v.duration > 0) {
              setDuration(v.duration);
            }
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

      {/* Torrent Preview Card */}
      <AnimatePresence>
        {showTorrentPreview && pendingP2PSource && !resolving && (
          <motion.div 
            key="torrent-preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black z-35 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-2xl bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-md font-bold tracking-wider">P2P</span>
                      {pendingP2PSource.quality && pendingP2PSource.quality !== 'Unknown' && (
                        <span className="text-[9px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-md font-bold">{pendingP2PSource.quality}</span>
                      )}
                      {pendingP2PSource.codec && (
                        <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold ${pendingP2PSource.codec === 'HEVC' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-white/50'}`}>{pendingP2PSource.codec}</span>
                      )}
                      {pendingP2PSource.audioCodec && (
                        <span className="text-[9px] bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-md font-bold">{pendingP2PSource.audioCodec}</span>
                      )}
                    </div>
                    <h3 className="text-sm text-white/90 font-medium leading-snug break-words line-clamp-2">
                      {pendingP2PSource.filename || pendingP2PSource.name}
                    </h3>
                    {titleLine && (
                      <p className="text-xs text-white/40 mt-1">{titleLine}</p>
                    )}
                  </div>
                  <button 
                    onClick={handleBack}
                    className="text-white/30 hover:text-white transition-colors p-1 shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>
                
                {/* File stats row */}
                <div className="flex items-center gap-4 mt-3 text-[10px] text-white/40">
                  {pendingP2PSource.size && (
                    <span className="flex items-center gap-1"><HardDrive size={11} /> {pendingP2PSource.size}</span>
                  )}
                  {(pendingP2PSource.seeds != null && pendingP2PSource.seeds > 0) && (
                    <span className="flex items-center gap-1 text-emerald-400/70"><Users size={11} /> {pendingP2PSource.seeds} seeds</span>
                  )}
                  {probeData?.duration && (
                    <span className="flex items-center gap-1"><FileVideo size={11} /> {formatDuration(probeData.duration)}</span>
                  )}
                  {probeData?.video && (
                    <span className="flex items-center gap-1">{probeData.video.width}x{probeData.video.height}</span>
                  )}
                </div>
              </div>

              {/* Track Info from ffprobe */}
              {probePending && (
                <div className="p-4 flex items-center justify-center gap-2 text-white/30 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing tracks...</span>
                </div>
              )}
              
              {probeData && (
                <div className="p-4 space-y-3">
                  {/* Audio Tracks */}
                  {probeData.audio.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Headphones size={12} className="text-white/40" />
                        <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Audio Tracks ({probeData.audio.length})</span>
                      </div>
                      <div className="space-y-1">
                        {probeData.audio.map((track) => (
                          <div key={track.trackIndex} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs text-white/70">{track.title || getLangLabel(track.language)}</span>
                              {track.isDefault && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/70 font-bold">DEFAULT</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[9px] text-white/30 shrink-0">
                              {track.channels && (
                                <span>{track.channels === 2 ? 'Stereo' : track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : `${track.channels}ch`}</span>
                              )}
                              <span className="uppercase font-mono">{track.codec}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subtitle Tracks */}
                  {probeData.subtitle.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Captions size={12} className="text-white/40" />
                        <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Embedded Subtitles ({probeData.subtitle.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {probeData.subtitle.map((track) => {
                          const isBitmap = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'pgs', 'vobsub'].includes((track.codec || '').toLowerCase());
                          return (
                            <span 
                              key={track.trackIndex}
                              className={`text-[10px] px-2 py-1 rounded-md font-medium ${isBitmap ? 'bg-white/5 text-white/25' : 'bg-white/[0.06] text-white/50'}`}
                              title={isBitmap ? 'Bitmap subtitle (non-extractable)' : track.codec}
                            >
                              {track.title || getLangLabel(track.language)}
                              {track.isForced && ' (Forced)'}
                              {isBitmap && ' (PGS)'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="p-4 pt-0 flex items-center gap-3">
                <button
                  onClick={() => playP2PSource(pendingP2PSource)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-black font-semibold text-sm rounded-xl hover:bg-white/90 transition-colors active:scale-[0.98]"
                >
                  <Play size={16} fill="currentColor" />
                  Play
                </button>
                {sources.length > 1 && (
                  <button
                    onClick={() => {
                      setShowTorrentPreview(false);
                      setShowSourceSelector(true);
                    }}
                    className="px-4 py-2.5 text-white/60 hover:text-white text-sm font-medium rounded-xl border border-white/10 hover:border-white/20 transition-colors"
                  >
                    Other Sources ({sources.length})
                  </button>
                )}
              </div>
            </motion.div>
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
                className={`relative w-full h-[18px] ${timelineDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} group/tl flex items-center rounded-full bg-white/5 backdrop-blur-sm`}
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
                <span className="text-white/40 text-xs tabular-nums shrink-0 ml-2">{formatTime(currentTime)} / {formatTime(safeDuration)}</span>
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

                  {showAudioControl && (
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
                        <Headphones size={18} />
                        <span className="text-[11px] font-bold">AUDIO</span>
                      </button>

                      <AnimatePresence>
                        {showAudioMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            className="absolute bottom-full right-0 mb-3 w-72 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="p-3 border-b border-white/10 bg-white/5">
                              <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider">Audio Tracks</h4>
                            </div>
                            <div className="max-h-[280px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-white/10">
                              
                              {/* FFprobe-detected tracks (primary for P2P) */}
                              {probeData && probeData.audio.length > 0 && (
                                <>
                                  {probeData.audio.map((track) => (
                                    <button
                                      key={`probe-${track.trackIndex}`}
                                      onClick={() => selectAudioTrack(track.trackIndex)}
                                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${currentAudioTrack === track.trackIndex ? 'text-white' : 'text-zinc-400'}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="truncate">{track.title || getLangLabel(track.language)}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {track.channels && (
                                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-bold">
                                              {track.channels === 2 ? 'Stereo' : track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : `${track.channels}ch`}
                                            </span>
                                          )}
                                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-bold uppercase">{track.codec}</span>
                                          {track.isDefault && (
                                            <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400/60 font-bold">DEF</span>
                                          )}
                                        </div>
                                      </div>
                                      {currentAudioTrack === track.trackIndex && <Check size={14} className="text-emerald-400 shrink-0 ml-2" />}
                                    </button>
                                  ))}
                                </>
                              )}

                              {/* Browser-detected tracks (fallback when no ffprobe data) */}
                              {(!probeData || probeData.audio.length === 0) && audioTracks.length > 0 && (
                                <>
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
                                </>
                              )}

                              {/* Restore Original Audio when transcoding */}
                              {streamUrl && streamUrl.includes('transcode=1') && (
                                <button
                                  onClick={() => {
                                      const baseUrl = streamUrl.split('?')[0];
                                      const currentParams = new URLSearchParams(streamUrl.split('?')[1] || '');
                                      const fileIdx = currentParams.get('fileIdx') || '0';
                                      const newUrl = `${baseUrl}?fileIdx=${fileIdx}`;
                                      setLastLog('Restoring original audio...');
                                      setStreamUrl(newUrl);
                                      setCurrentAudioTrack(0);
                                      setShowAudioMenu(false);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-white/5 transition-colors text-amber-400 border-t border-white/5"
                                >
                                  <RotateCcw size={14} />
                                  <span>Restore Original Audio</span>
                                </button>
                              )}

                              {/* Source variants (same torrent, different audio) */}
                              {relatedAudioVariants.length > 1 && (
                                <>
                                  <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/40 font-bold border-t border-white/5 mt-1">Source Variants</div>
                                  {relatedAudioVariants.map((variant) => (
                                    <button
                                      key={variant.id}
                                      onClick={async () => {
                                        await changeSource(variant);
                                        setShowAudioMenu(false);
                                      }}
                                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${currentSource?.id === variant.id ? 'text-white' : 'text-zinc-400'}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="truncate">{variant.audioCodec || 'Auto'}</span>
                                        {variant.quality && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 font-bold shrink-0">{variant.quality}</span>
                                        )}
                                      </div>
                                      {currentSource?.id === variant.id && <Check size={14} className="text-emerald-400 shrink-0" />}
                                    </button>
                                  ))}
                                </>
                              )}

                              {(!probeData || probeData.audio.length === 0) && audioTracks.length === 0 && relatedAudioVariants.length <= 1 && (
                                <div className="px-4 py-3 text-xs text-white/40">
                                  {probePending ? 'Analyzing audio tracks...' : 'No switchable audio tracks detected'}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  
                  {/* Subtitles / CC */}
                  <div className="relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowSubtitleMenu(!showSubtitleMenu); setShowSourceSelector(false); setShowAudioMenu(false); }}
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
                          className="absolute bottom-full right-0 mb-3 w-72 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="p-3 border-b border-white/10 bg-white/5">
                            <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider">Subtitles</h4>
                            <span className="text-[9px] text-white/30">{subtitles.length} available</span>
                          </div>
                          <div className="max-h-[320px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-white/10">
                            {/* Off button */}
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
                              // Group by provider with section headers
                              Object.entries(subtitleGroups).map(([provider, subs]) => {
                                const providerColors: Record<string, string> = {
                                  'Embedded': 'text-purple-400 bg-purple-500/10',
                                  'Sidecar': 'text-sky-400 bg-sky-500/10',
                                  'OpenSubtitles': 'text-emerald-400 bg-emerald-500/10',
                                  'SubDL': 'text-amber-400 bg-amber-500/10',
                                  'SubSource': 'text-pink-400 bg-pink-500/10',
                                };
                                const colorClass = providerColors[provider] || 'text-white/50 bg-white/10';
                                
                                return (
                                  <div key={provider}>
                                    <div className="px-4 pt-2.5 pb-1 flex items-center gap-2 border-t border-white/5 first:border-t-0">
                                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${colorClass}`}>
                                        {provider}
                                      </span>
                                      <span className="text-[9px] text-white/20">{subs.length}</span>
                                    </div>
                                    {subs.map((sub) => {
                                      const globalIdx = subtitles.findIndex(s => s.fileIdx === sub.fileIdx);
                                      return (
                                        <button
                                          key={sub.fileIdx}
                                          onClick={() => { setCurrentSubtitle(globalIdx); setShowSubtitleMenu(false); }}
                                          className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${currentSubtitle === globalIdx ? 'text-white' : 'text-zinc-400'}`}
                                        >
                                          <span className="truncate">{sub.label}</span>
                                          {currentSubtitle === globalIdx && <Check size={14} className="text-emerald-400 shrink-0" />}
                                        </button>
                                      );
                                    })}
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
