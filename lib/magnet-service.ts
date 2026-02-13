import WebTorrent from 'webtorrent';
import { existsSync, mkdirSync } from 'fs';

// Global singleton to persist client across requests/reloads
// Note: WebTorrent client is heavy (DHT, ports). We want only one.
const globalForMagnet = global as unknown as { 
    magnetClient: WebTorrent.Instance;
    torrentTimers: Map<string, NodeJS.Timeout>;
    torrentLastAccess: Map<string, number>;
};

// Idle timeout: destroy torrents that haven't been accessed in 2 minutes
const TORRENT_IDLE_MS = Number(process.env.TORRENT_IDLE_MS || 45_000);
const MAX_ACTIVE_TORRENTS = Number(process.env.MAX_ACTIVE_TORRENTS || 1);
const DEBUG_TORRENT_LOGS = process.env.DEBUG_TORRENT_LOGS === '1';
const TORRENT_STORAGE_PATH =
    process.env.TORRENT_STORAGE_PATH || (existsSync('/dev/shm') ? '/dev/shm/webtorrent' : '/tmp/webtorrent');
const DEFAULT_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://tracker.openbittorrent.com:80/announce',
    'udp://opentracker.i2p.rocks:6969/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.internetwarriors.net:1337/announce',
    'udp://tracker.leechers-paradise.org:6969/announce',
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://tracker.tiny-vps.com:6969/announce',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.files.fm:7073/announce'
];

if (!globalForMagnet.torrentTimers) {
    globalForMagnet.torrentTimers = new Map();
}

if (!globalForMagnet.torrentLastAccess) {
    globalForMagnet.torrentLastAccess = new Map();
}

if (!existsSync(TORRENT_STORAGE_PATH)) {
    try {
        mkdirSync(TORRENT_STORAGE_PATH, { recursive: true });
    } catch {}
}

function markTorrentAccess(infoHash: string) {
    globalForMagnet.torrentLastAccess.set(infoHash, Date.now());
}

function pruneOtherTorrents(currentInfoHash: string) {
    const client = globalForMagnet.magnetClient;
    if (!client) return;

    const others = client.torrents.filter((t) => t.infoHash !== currentInfoHash);
    if (others.length <= Math.max(0, MAX_ACTIVE_TORRENTS - 1)) return;

    const sortedByOldest = [...others].sort((a, b) => {
        const ta = globalForMagnet.torrentLastAccess.get(a.infoHash) || 0;
        const tb = globalForMagnet.torrentLastAccess.get(b.infoHash) || 0;
        return ta - tb;
    });

    const toDestroy = sortedByOldest.slice(0, others.length - (MAX_ACTIVE_TORRENTS - 1));
    toDestroy.forEach((torrent) => {
        try {
            destroyTorrent(torrent.infoHash);
        } catch {}
    });
}

function resetIdleTimer(infoHash: string) {
    markTorrentAccess(infoHash);
    const timers = globalForMagnet.torrentTimers;
    if (timers.has(infoHash)) clearTimeout(timers.get(infoHash)!);
    timers.set(infoHash, setTimeout(() => {
        const client = globalForMagnet.magnetClient;
        if (!client) return;
        const torrent = client.get(infoHash);
        // FIX: Check if torrent is a Promise (can happen in async contexts)
        if (torrent && typeof (torrent as any).then !== 'function') {
            if (DEBUG_TORRENT_LOGS) {
                console.log(`[MagnetService] Idle timeout, destroying: ${infoHash.substring(0, 8)}...`);
            }
            try {
                (torrent as unknown as WebTorrent.Torrent).destroy();
            } catch (err) {
                console.error(`[MagnetService] Error destroying torrent: ${err}`);
            }
        }
        timers.delete(infoHash);
        globalForMagnet.torrentLastAccess.delete(infoHash);
    }, TORRENT_IDLE_MS));
}

export const getMagnetClient = () => {
  if (!globalForMagnet.magnetClient) {
        if (DEBUG_TORRENT_LOGS) {
                console.log('[MagnetService] Initializing WebTorrent client...');
        }
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

export async function getTorrentByInfoHash(infoHash: string): Promise<WebTorrent.Torrent | null> {
    const client = getMagnetClient();
    let torrent: any = client.get(infoHash);

    if (torrent && typeof (torrent as any).then === 'function') {
        torrent = await (torrent as any);
    }

    if (!torrent) return null;
    return torrent as WebTorrent.Torrent;
}

export async function prioritizeTorrentRange(infoHash: string, startByte: number, endByte: number) {
    const torrent = await getTorrentByInfoHash(infoHash);
    if (!torrent || !torrent.pieceLength) return;

    const startPiece = Math.max(0, Math.floor(startByte / torrent.pieceLength));
    const endPiece = Math.max(startPiece, Math.floor(endByte / torrent.pieceLength));

    try {
        const torrentAny = torrent as any;
        if (typeof torrentAny.critical === 'function') {
            torrentAny.critical(startPiece, endPiece);
        }
    } catch (err) {
        // Ignore unsupported critical-range errors on older clients
    }

    resetIdleTimer(infoHash);
}

export function destroyTorrent(infoHash: string) {
    const client = globalForMagnet.magnetClient;
    if (!client) return;
    const torrent = client.get(infoHash);
    // FIX: Check if torrent is a Promise before calling destroy
    if (torrent && typeof (torrent as any).then !== 'function') {
        if (DEBUG_TORRENT_LOGS) {
            console.log(`[MagnetService] Destroying torrent: ${infoHash.substring(0, 8)}...`);
        }
        try {
            const torrentObj = torrent as unknown as WebTorrent.Torrent;
            try {
                client.remove(torrentObj, { destroyStore: true } as any);
            } catch {}
            torrentObj.destroy({ destroyStore: true } as any);
        } catch (err) {
            console.error(`[MagnetService] Error destroying torrent: ${err}`);
        }
    }
    const timers = globalForMagnet.torrentTimers;
    if (timers.has(infoHash)) {
        clearTimeout(timers.get(infoHash)!);
        timers.delete(infoHash);
    }
    globalForMagnet.torrentLastAccess.delete(infoHash);
}

export function destroyAllTorrents() {
    const client = globalForMagnet.magnetClient;
    if (!client) return;
    const count = client.torrents.length;
    client.torrents.forEach(t => {
        try {
            try { client.remove(t, { destroyStore: true } as any); } catch {}
            t.destroy({ destroyStore: true } as any);
        } catch(e) {}
    });
    globalForMagnet.torrentTimers.forEach(t => clearTimeout(t));
    globalForMagnet.torrentTimers.clear();
    globalForMagnet.torrentLastAccess.clear();
    if (DEBUG_TORRENT_LOGS) {
        console.log(`[MagnetService] Destroyed all ${count} torrents`);
    }
}

export const getFileFromMagnet = async (infoHash: string, fileIdx: number = 0): Promise<WebTorrent.TorrentFile | null> => {
    const client = getMagnetClient();
    const trParams = DEFAULT_TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    const magnetURI = `magnet:?xt=urn:btih:${infoHash}${trParams}`;

    // Check if already added
    let torrent: any = client.get(infoHash);

    // FIX: client.get might return a Promise in some environments (e.g. Next.js server)
    if (torrent && typeof (torrent as any).then === 'function') {
        torrent = await (torrent as any);
    }
    
    if (!torrent) {
        if (DEBUG_TORRENT_LOGS) {
            console.log(`[MagnetService] Adding torrent: ${infoHash}`);
        }
        pruneOtherTorrents(infoHash);
        torrent = client.add(magnetURI, { 
            destroyStoreOnDestroy: true, // Don't fill disk space permanently
            path: TORRENT_STORAGE_PATH // RAM-backed when /dev/shm is available
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
                if (DEBUG_TORRENT_LOGS) {
                    console.log(`[MagnetService] Metadata timeout, retry ${retries}/${MAX_RETRIES}`);
                }
                // Destroy and re-add to reset state
                try { torrent.destroy({ destroyStore: true } as any); } catch(e) {}
                torrent = client.add(magnetURI, { 
                    destroyStoreOnDestroy: true,
                    path: TORRENT_STORAGE_PATH
                });
            }
        }
    }
    
    // Select File
    // If fileIdx is provided, use it. Otherwise find largest file (video)
    let file: WebTorrent.TorrentFile;
    
    const safeFileIdx = Number.isFinite(fileIdx) ? Number(fileIdx) : -1;

    if (safeFileIdx >= 0 && torrent.files[safeFileIdx]) {
        file = torrent.files[safeFileIdx];
    } else if (fileIdx === 0 && torrent.files[0] && torrent.files.length === 1) {
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
    if (DEBUG_TORRENT_LOGS && !torrent.listenerCount('download')) {
        let lastLogTime = 0;
        const onDownload = (bytes: number) => {
             const now = Date.now();
             if (now - lastLogTime > 30000) {
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
