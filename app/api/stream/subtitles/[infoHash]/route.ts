import { getMagnetClient } from '@/lib/magnet-service';
import { NextResponse } from 'next/server';

export async function GET(request: Request, props: { params: Promise<{ infoHash: string }> }) {
    const params = await props.params;
    const { infoHash } = params;

    try {
        const client = getMagnetClient();
        let torrent: any = client.get(infoHash);

        // Handle case where get() might return a promise
        if (torrent && typeof torrent.then === 'function') {
            torrent = await torrent;
        }

        if (!torrent || !torrent.metadata) {
             return NextResponse.json({ subtitles: [] });
        }

        // Find .srt or .vtt files
        const subtitleFiles = torrent.files
            .map((file, index) => {
                const name = file.name.toLowerCase();
                const isSub = name.endsWith('.srt') || name.endsWith('.vtt');
                return isSub ? { index, name: file.name, path: file.path } : null;
            })
            .filter(item => item !== null)
            .map(item => ({
                 label: item!.name.replace(/\.(srt|vtt)$/i, '').split(/[.\-_]/).pop()?.toUpperCase() || 'Unknown',
                 fileIdx: item!.index,
                 lang: 'en' // Hard to detect easily without parsing filename better
            }));
            
        return NextResponse.json({ subtitles: subtitleFiles });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
