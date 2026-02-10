
'use client';

import React, { useEffect, useRef, useState } from 'react';
// We import WebTorrent dynamically to avoid SSR issues
import type { Instance as WebTorrentInstance, Torrent } from 'webtorrent';

interface TorrentPlayerProps {
  magnet: string;
  poster?: string;
  autoplay?: boolean;
  onReady?: () => void;
  onError?: (err: string) => void;
}

export default function TorrentPlayer({ magnet, poster, autoplay, onReady, onError }: TorrentPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<WebTorrentInstance | null>(null);
  const torrentRef = useRef<Torrent | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [status, setStatus] = useState('Initializing P2P...');
  
  useEffect(() => {
    let mounted = true;
    let client: WebTorrentInstance;

    async function initClient() {
      try {
        const WebTorrent = (await import('webtorrent')).default;
        if (!mounted) return;
        
        client = new WebTorrent();
        clientRef.current = client;

        setStatus('Connecting to peers...');
        
        client.add(magnet, (torrent) => {
          if (!mounted) return;
          torrentRef.current = torrent;
          setStatus('Metadata received. Finding video...');

          // Find the largest file (usually the video)
          const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi') || f.name.endsWith('.webm'));
          const targetFile = file || torrent.files.reduce((a, b) => a.length > b.length ? a : b);

          if (targetFile) {
            setStatus(`Streaming: ${targetFile.name}`);
            targetFile.renderTo(videoRef.current!, {
                autoplay: !!autoplay
            }, (err: any) => {
                if (err && onError) {
                    const msg = typeof err === 'string' ? err : err.message;
                    onError(msg || 'Render Error');
                }
            });
            onReady?.();
          } else {
             if (onError) onError('No video file found in torrent');
          }

          torrent.on('download', () => {
             if (!mounted) return;
             setProgress(torrent.progress);
             setDownloadSpeed(torrent.downloadSpeed);
          });
          
        });
        
        client.on('error', (err: string | Error) => {
            console.error('WebTorrent Client Error:', err);
            const msg = typeof err === 'string' ? err : err.message;
            if (onError) onError(msg || 'P2P Error');
        });

      } catch (e: any) {
        console.error('Failed to load WebTorrent:', e);
        if (onError) onError('Failed to load torrent engine');
      }
    }

    initClient();

    return () => {
      mounted = false;
      if (client) {
         try {
             client.destroy();
         } catch(e) { /* ignore */ }
      }
    };
  }, [magnet, autoplay, onError, onReady]);

  return (
    <div className="relative w-full h-full bg-black">
      <video 
        ref={videoRef} 
        controls 
        poster={poster}
        className="w-full h-full object-contain"
        playsInline
      />
      
      {/* Overlay Status for buffering/loading */}
      {progress < 1 && progress > 0 && (
          <div className="absolute top-4 right-4 bg-black/60 text-white text-xs px-3 py-1.5 rounded backdrop-blur font-mono pointer-events-none">
              <p>DL: {(downloadSpeed / 1024 / 1024).toFixed(2)} MB/s</p>
              <p>Prog: {(progress * 100).toFixed(1)}%</p>
          </div>
      )}
      
      {progress === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/80 px-4 py-2 rounded text-white text-sm">
                  {status}
              </div>
          </div>
      )}
    </div>
  );
}
