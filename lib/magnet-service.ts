import WebTorrent from 'webtorrent';

// Global singleton to persist client across requests/reloads
// Note: WebTorrent client is heavy (DHT, ports). We want only one.
const globalForMagnet = global as unknown as { 
    magnetClient: WebTorrent.Instance;
    torrentTimers: Map<string, NodeJS.Timeout>;
};

// Idle timeout: destroy torrents that haven't been accessed in 2 minutes
const TORRENT_IDLE_MS = 2 * 60 * 1000;

if (!globalForMagnet.torrentTimers) {
    globalForMagnet.torrentTimers = new Map();
}

function resetIdleTimer(infoHash: string) {
    const timers = globalForMagnet.torrentTimers;
    if (timers.has(infoHash)) clearTimeout(timers.get(infoHash)!);
    timers.set(infoHash, setTimeout(() => {
        const client = globalForMagnet.magnetClient;
        if (!client) return;
        const torrent = client.get(infoHash);
        // FIX: Check if torrent is a Promise (can happen in async contexts)
        if (torrent && typeof (torrent as any).then !== 'function') {
            console.log(`[MagnetService] Idle timeout, destroying: ${infoHash.substring(0, 8)}...`);
            try {
                (torrent as unknown as WebTorrent.Torrent).destroy();
            } catch (err) {
                console.error(`[MagnetService] Error destroying torrent: ${err}`);
            }
        }
        timers.delete(infoHash);
    }, TORRENT_IDLE_MS));
}

export const getMagnetClient = () => {
  if (!globalForMagnet.magnetClient) {
    console.log('[MagnetService] Initializing WebTorrent client...');
    globalForMagnet.magnetClient = new WebTorrent({
        // Increased connections for faster peer discovery
        maxConns: 500,
        // Enable all discovery methods
        dht: true, 
        lsd: true,
        tracker: true,
        webSeeds: true, 
    });
    
    globalForMagnet.magnetClient.on('error', (err) => {
        console.error('[MagnetService] Client error:', err);
    });
  }
  return globalForMagnet.magnetClient;
};

export function destroyTorrent(infoHash: string) {
    const client = globalForMagnet.magnetClient;
    if (!client) return;
    const torrent = client.get(infoHash);
    // FIX: Check if torrent is a Promise before calling destroy
    if (torrent && typeof (torrent as any).then !== 'function') {
        console.log(`[MagnetService] Destroying torrent: ${infoHash.substring(0, 8)}...`);
        try {
            (torrent as unknown as WebTorrent.Torrent).destroy();
        } catch (err) {
            console.error(`[MagnetService] Error destroying torrent: ${err}`);
        }
    }
    const timers = globalForMagnet.torrentTimers;
    if (timers.has(infoHash)) {
        clearTimeout(timers.get(infoHash)!);
        timers.delete(infoHash);
    }
}

export function destroyAllTorrents() {
    const client = globalForMagnet.magnetClient;
    if (!client) return;
    const count = client.torrents.length;
    client.torrents.forEach(t => {
        try { t.destroy(); } catch(e) {}
    });
    globalForMagnet.torrentTimers.forEach(t => clearTimeout(t));
    globalForMagnet.torrentTimers.clear();
    console.log(`[MagnetService] Destroyed all ${count} torrents`);
}

export const getFileFromMagnet = async (infoHash: string, fileIdx: number = 0): Promise<WebTorrent.TorrentFile | null> => {
    const client = getMagnetClient();
    const trackers = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://tracker.openbittorrent.com:80/announce',
        'udp://9.rarbg.com:2810/announce',
        'udp://tracker.kp.muni.cz:80/announce',
        'udp://www.torrent.eu.org:451/announce',
        'udp://tracker.tiny-vps.com:6969/announce',
        'udp://tracker.moeking.me:6969/announce',
        'https://p4p.arenabg.com:1337/announce',
        'wss://tracker.openwebtorrent.com',
    ];
    const trParams = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    const magnetURI = `magnet:?xt=urn:btih:${infoHash}${trParams}`;

    // Check if already added
    let torrent: any = client.get(infoHash);

    // FIX: client.get might return a Promise in some environments (e.g. Next.js server)
    if (torrent && typeof (torrent as any).then === 'function') {
        torrent = await (torrent as any);
    }
    
    if (!torrent) {
        console.log(`[MagnetService] Adding torrent: ${infoHash}`);
        torrent = client.add(magnetURI, { 
            destroyStoreOnDestroy: true, // Don't fill disk space permanently
            path: '/tmp/webtorrent' // Store in tmp
        });
    }

    // FIX: client.add might return a promise too? (Unlikely per tests, but being safe)
    if (torrent && typeof (torrent as any).then === 'function') {
        torrent = await (torrent as any);
    }

    // Wait for metadata with longer timeout and retry logic
    if (!torrent.metadata) {
        const MAX_RETRIES = 2;
        let retries = 0;
        while (retries < MAX_RETRIES) {
            try {
                await new Promise<void>((resolve, reject) => {
                    // Longer timeout: 60s for metadata (DHT/tracker discovery is slow sometimes)
                    const timeout = setTimeout(() => reject(new Error('Metadata timeout')), 60000);
                    torrent!.once('metadata', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    torrent!.once('error', (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    });
                    // Also resolve if already ready (race cond)
                    if (torrent!.metadata) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
                break; // Success
            } catch (err) {
                retries++;
                if (retries >= MAX_RETRIES) {
                    throw err; // Give up after retries
                }
                console.log(`[MagnetService] Metadata timeout, retry ${retries}/${MAX_RETRIES}`);
                // Destroy and re-add to reset state
                try { torrent.destroy(); } catch(e) {}
                torrent = client.add(magnetURI, { 
                    destroyStoreOnDestroy: true,
                    path: '/tmp/webtorrent'
                });
            }
        }
    }
    
    // Select File
    // If fileIdx is provided, use it. Otherwise find largest file (video)
    let file: WebTorrent.TorrentFile;
    
    if (fileIdx !== undefined && torrent.files[fileIdx]) {
        file = torrent.files[fileIdx];
    } else {
        // Find largest
        file = torrent.files.reduce((a, b) => a.length > b.length ? a : b);
    }
    
    // Deselect others to save bandwidth
    torrent.files.forEach(f => {
        if (f !== file) f.deselect();
    });
    file.select();

    // Log progress/speed for debugging (reduced spam)
    if (!torrent.listenerCount('download')) {
        let lastLogTime = 0;
        const onDownload = (bytes: number) => {
             const now = Date.now();
             if (now - lastLogTime > 10000) { // Log every 10s max
                lastLogTime = now;
                const speed = (client.downloadSpeed / 1024 / 1024).toFixed(2);
                console.log(`[MagnetService] ${torrent.infoHash.substring(0, 6)}... Speed: ${speed} MB/s | Peers: ${torrent.numPeers} | Progress: ${(torrent.progress * 100).toFixed(1)}%`);
            }
        };
        torrent.on('download', onDownload);
    }
    
    // Reset idle timer every time a file is requested
    resetIdleTimer(infoHash);
    
    // Critical: Prioritize the beginning of the file to allow instant playback
    const startByte = 0;
    const endByte = Math.min(file.length - 1, 5 * 1024 * 1024); // First 5MB
    const pieceLength = torrent.pieceLength;
    const startPiece = Math.floor(startByte / pieceLength);
    const endPiece = Math.floor(endByte / pieceLength);
    
    // torrent.select(startPiece, endPiece, 10); // 10 = high priority
    // Note: 'select' range is deprecated in some versions, but 'critical' works if supported, or just file.select() handles it generally.
    // Explicit piece selection for buffering:
    // Important: We need a reasonable buffer, but not too aggressive to stall the whole torrent
    // REDUCED: Only critical the very first piece for metadata/headers. Let readStream drive the rest.
    if (startPiece >= 0 && startPiece < torrent.pieces.length) {
         torrent.critical(startPiece, startPiece);
    }
    
    return file;
};
