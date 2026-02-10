// Proxy to fetch subtitles from OpenSubtitles via Stremio Addon
// This avoids CORs issues and allows caching/processing
import { NextRequest, NextResponse } from 'next/server';
import { getOpenSubtitles } from '@/lib/subtitle-service';
import { gotScraping } from 'got-scraping';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const imdbId = searchParams.get('imdbId');
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!imdbId) {
        return NextResponse.json({ error: 'Missing imdbId' }, { status: 400 });
    }

    try {
        const subs = await getOpenSubtitles(
            imdbId, 
            season ? parseInt(season) : undefined, 
            episode ? parseInt(episode) : undefined
        );

        // Sort: Arabic first, then English, then others
        subs.sort((a, b) => {
            if (a.lang === 'ara' && b.lang !== 'ara') return -1;
            if (a.lang !== 'ara' && b.lang === 'ara') return 1;
            if (a.lang === 'eng' && b.lang !== 'eng') return -1;
            if (a.lang !== 'eng' && b.lang === 'eng') return 1;
            return 0;
        });

        // Deduplicate: keep only the first (best) subtitle per language
        // This dramatically reduces 429 errors from the proxy
        const seen = new Map<string, typeof subs>();
        for (const sub of subs) {
            if (!seen.has(sub.lang)) seen.set(sub.lang, []);
            seen.get(sub.lang)!.push(sub);
        }
        
        // Take top 2 per language to give variety without spam
        const deduped = Array.from(seen.values()).flatMap(group => group.slice(0, 2));
        
        return NextResponse.json({ subtitles: deduped });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
