import { getMagnetClient, getTorrentDeliveryStats } from '@/lib/magnet-service';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const searchParams = new URL(request.url).searchParams;
    const rawHash = searchParams.get('infoHash');
    const infoHash = rawHash ? rawHash.trim().toLowerCase() : null;

    if (!infoHash) {
        return new NextResponse(JSON.stringify({ error: 'Missing infoHash' }), { status: 400 });
    }

    try {
        const client = getMagnetClient();
        let torrent: any = client.get(infoHash);

        // Handle case where get() might return a promise (shouldn't happen, but being safe)
        if (torrent && typeof torrent.then === 'function') {
            torrent = await torrent;
        }

        if (!torrent) {
            return new NextResponse(JSON.stringify({ 
                error: 'Torrent not found',
                infoHash,
                torrents: client.torrents.length
            }), { status: 404 });
        }

        const delivery = getTorrentDeliveryStats(infoHash);

        return new NextResponse(JSON.stringify({
            infoHash: torrent.infoHash || infoHash,
            name: torrent.name || 'Unknown',
            downloadSpeed: torrent.downloadSpeed || 0,
            uploadSpeed: torrent.uploadSpeed || 0,
            progress: torrent.progress || 0,
            numPeers: torrent.numPeers || 0,
            numActivePeers: torrent.numActivePeers || torrent.numPeers || 0,
            selected: torrent.selected || false,
            length: torrent.length || 0,
            downloaded: torrent.downloaded || 0,
            deliveredSpeed: delivery?.bytesPerSec || 0,
            deliveredUpdatedAt: delivery?.updatedAt || null,
            paused: torrent.paused || false,
            metadata: !!torrent.metadata,
            files: (torrent.files || []).map((f: any, i: number) => ({
                name: f.name,
                length: f.length,
                index: i
            }))
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store'
            }
        });

    } catch (error: any) {
        console.error('[StatsAPI] Error:', error);
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
