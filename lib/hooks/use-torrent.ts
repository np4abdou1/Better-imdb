
import { useEffect, useRef, useState } from 'react';

export function useTorrentStream(
  videoRef: React.RefObject<HTMLVideoElement>, 
  magnet: string | null
) {
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<any>(null); // WebTorrent instance
  const torrentRef = useRef<any>(null);

  // Smart Buffering Configuration
  const MAX_BUFFER_SECONDS = 60; // Stop downloading if we have 60s buffered
  const MIN_BUFFER_SECONDS = 20; // Resume if we drop below 20s

  useEffect(() => {
    if (!magnet || !magnet.startsWith('magnet:')) {
        return;
    }

    let mounted = true;
    let bufferInterval: NodeJS.Timeout;
    
    const init = async () => {
        try {
            console.log('[Torrent] Initializing client...');
            setStatus('Initializing P2P engine...');
            const WebTorrent = (await import('webtorrent')).default;
            
            if (!mounted) return;
            
            // Destroy previous client if any
            if (clientRef.current) {
                console.log('[Torrent] Destroying previous client');
                try { clientRef.current.destroy(); } catch(e) {}
            }

            const client = new WebTorrent();
            clientRef.current = client;

            setStatus('Searching for peers...');
            
            // Capture torrent instance immediately
            const torrentInstance = client.add(magnet, (torrent) => {
                if (!mounted) {
                    console.log('[Torrent] Metadata loaded but unmounted. Aborting.');
                    try { torrent.destroy(); } catch(e) {}
                    return;
                }
                torrentRef.current = torrent;
                
                console.log('[Torrent] Metadata received');
                setStatus('Metadata loaded. Buffering...');

                // Find the main video file
                const file = torrent.files.find(f => 
                    f.name.endsWith('.mp4') || 
                    f.name.endsWith('.mkv') || 
                    f.name.endsWith('.avi') || 
                    f.name.endsWith('.webm')
                ) || torrent.files.reduce((a, b) => a.length > b.length ? a : b);

                if (!file) {
                    setError('No video file found in torrent');
                    return;
                }

                // Deselect other video files to save bandwidth, but keep subtitles
                torrent.files.forEach(f => {
                    const isVideo = f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi') || f.name.endsWith('.webm');
                    const isSub = f.name.endsWith('.srt') || f.name.endsWith('.vtt') || f.name.endsWith('.ass');
                    if (f !== file && !isSub) {
                        f.deselect();
                    }
                });

                if (videoRef.current) {
                    setStatus(`Streaming ${file.name}`);
                    file.renderTo(videoRef.current, {
                        autoplay: true
                    }, (err: any) => {
                        if (err && mounted) {
                             const msg = typeof err === 'string' ? err : err.message;
                             setError(msg || 'Render Error');
                        }
                    });
                }

                torrent.on('download', () => {
                    if(mounted) {
                        setDownloadSpeed(torrent.downloadSpeed);
                        setProgress(torrent.progress);
                        setPeers(torrent.numPeers);
                    }
                });

                torrent.on('wire', () => {
                    if(mounted) setPeers(torrent.numPeers);
                });
            });
            
            // Store reference immediately so cleanup works even before metadata
            torrentRef.current = torrentInstance;

            client.on('error', (err: string | Error) => {
                console.error('[Torrent] Error:', err);
                const msg = typeof err === 'string' ? err : err.message;
                if(mounted) setError(msg || 'P2P Error');
            });

            // Status Monitor Loop (Smart Buffering)
            bufferInterval = setInterval(() => {
                const video = videoRef.current;
                const torrent = torrentRef.current;
                
                if (!video || !torrent || !mounted) return;

                // Calculate buffer ahead
                let bufferedAhead = 0;
                for (let i = 0; i < video.buffered.length; i++) {
                    const start = video.buffered.start(i);
                    const end = video.buffered.end(i);
                    if (video.currentTime >= start && video.currentTime <= end) {
                        bufferedAhead = end - video.currentTime;
                        break;
                    }
                }

                // Strategy: Pause download if we have enough buffer to save bandwidth
                // BUT keep "critical" pieces (streaming) alive. 
                // WebTorrent 'pause' stops everything. 
                
                if (bufferedAhead > MAX_BUFFER_SECONDS && !torrent.paused) {
                    // console.log('[Torrent] Buffer full, pausing download');
                    // torrent.pause(); 
                    // Note: Pausing might kill the stream in some WebTorrent versions. 
                    // Safer strategy: throttle? 
                    // For now, let's trust WebTorrent's internal piece selection logic 
                    // but we can at least monitor it.
                    // Implementation: If we really want to stop "constant downloading", pause is the way.
                     torrent.pause();
                } else if (bufferedAhead < MIN_BUFFER_SECONDS && torrent.paused) {
                     // console.log('[Torrent] Buffer low, resuming');
                     torrent.resume();
                }

            }, 2000);

        } catch (e: any) {
            console.error('[Torrent] Failed to load module:', e);
            if(mounted) setError('Failed to load torrent engine');
        }
    };

    init();

    return () => {
        mounted = false;
        clearInterval(bufferInterval);
        console.log('[Torrent] Unmounting... Cleaning up.');
        
        // Force cleanup order
        const torrent = torrentRef.current;
        const client = clientRef.current;
        
        if (torrent) {
            try { 
                console.log('[Torrent] Destroying torrent instance');
                torrent.destroy(); 
            } catch(e) {}
        }
        
        if (client) {
            try { 
                console.log('[Torrent] Destroying client instance');
                client.destroy(); 
            } catch(e) {}
        }
        
        clientRef.current = null;
        torrentRef.current = null;
    };
  }, [magnet, videoRef]);

  return { downloadSpeed, progress, peers, status, error };
}
