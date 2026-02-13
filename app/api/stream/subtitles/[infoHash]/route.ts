import { getMagnetClient } from '@/lib/magnet-service';
import { NextResponse } from 'next/server';

export async function GET(request: Request, props: { params: Promise<{ infoHash: string }> }) {
    const params = await props.params;
    const infoHash = (params.infoHash || '').trim().toLowerCase();

    if (!/^[a-f0-9]{40}$/.test(infoHash)) {
        return NextResponse.json({ subtitles: [] });
    }

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

        const inferLanguage = (name: string): string => {
            const lower = name.toLowerCase();
            if (/\bara\b|arabic|\b(ar)\b|\bالعربية\b/.test(lower)) return 'ar';
            if (/\beng\b|english|\b(en)\b/.test(lower)) return 'en';
            if (/\bspa\b|spanish|\b(es)\b/.test(lower)) return 'es';
            if (/\bfre\b|french|\b(fr)\b/.test(lower)) return 'fr';
            if (/\bger\b|german|\b(de)\b/.test(lower)) return 'de';
            if (/\bita\b|italian|\b(it)\b/.test(lower)) return 'it';
            if (/\bpor\b|portuguese|\b(pt)\b/.test(lower)) return 'pt';
            if (/\brus\b|russian|\b(ru)\b/.test(lower)) return 'ru';
            if (/\bjpn\b|japanese|\b(ja)\b/.test(lower)) return 'ja';
            return 'unknown';
        };

        // Find sidecar subtitle files
        const subtitleFiles = torrent.files
            .map((file, index) => {
                const name = file.name.toLowerCase();
                const isSub = name.endsWith('.srt') || name.endsWith('.vtt') || name.endsWith('.ass') || name.endsWith('.ssa') || name.endsWith('.sub');
                return isSub ? { index, name: file.name, path: file.path } : null;
            })
            .filter(item => item !== null)
            .map(item => ({
                 label: item!.name.replace(/\.(srt|vtt|ass|ssa|sub)$/i, '').split(/[.\-_]/).pop()?.toUpperCase() || 'Unknown',
                 fileIdx: item!.index,
                 lang: inferLanguage(item!.name)
            }));
            
        return NextResponse.json({ subtitles: subtitleFiles });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
