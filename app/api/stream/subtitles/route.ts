// Proxy to fetch subtitles from OpenSubtitles via Stremio Addon
// This avoids CORs issues and allows caching/processing
import { NextRequest, NextResponse } from 'next/server';
import { getOpenSubtitles } from '@/lib/subtitle-service';

function isArabicLang(lang?: string, label?: string): boolean {
    const l = (lang || '').toLowerCase();
    const t = (label || '').toLowerCase();
    return l === 'ara' || l === 'ar' || t.includes('arabic') || t.includes('عرب');
}

function isEnglishLang(lang?: string, label?: string): boolean {
    const l = (lang || '').toLowerCase();
    const t = (label || '').toLowerCase();
    return l === 'eng' || l === 'en' || t.includes('english');
}

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
            const aAr = isArabicLang(a.lang, a.label);
            const bAr = isArabicLang(b.lang, b.label);
            if (aAr && !bAr) return -1;
            if (!aAr && bAr) return 1;

            const aEn = isEnglishLang(a.lang, a.label);
            const bEn = isEnglishLang(b.lang, b.label);
            if (aEn && !bEn) return -1;
            if (!aEn && bEn) return 1;

            return 0;
        });

        // Deduplicate: keep only the first (best) subtitle per language
        // This dramatically reduces 429 errors from the proxy
        const seen = new Map<string, typeof subs>();
        for (const sub of subs) {
            const key = (sub.lang || 'unknown').toLowerCase();
            if (!seen.has(key)) seen.set(key, []);
            seen.get(key)!.push(sub);
        }
        
        // Take top 2 per language to give variety without spam
        const deduped = Array.from(seen.values()).flatMap(group => group.slice(0, 2));
        
        return NextResponse.json({ subtitles: deduped });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
