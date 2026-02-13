// Service to fetch subtitles from Stremio's OpenSubtitles v3 addon mirror
import { gotScraping } from 'got-scraping';

// Official Stremio OpenSubtitles v3 Addon URL
const ADDON_URL = 'https://opensubtitles-v3.strem.io';

export interface Subtitle {
    id: string;
    url: string; // usually .srt
    lang: string; // ISO 639-2 (e.g., 'eng', 'por')
    label?: string; // Generated
}

function normalizeLanguageCode(code?: string | null): string {
    const value = (code || '').trim().toLowerCase();
    const aliases: Record<string, string> = {
        ar: 'ara',
        arabic: 'ara',
        arb: 'ara',
        eng: 'eng',
        en: 'eng'
    };
    return aliases[value] || value || 'unknown';
}

export async function getOpenSubtitles(imdbId: string, season?: number, episode?: number): Promise<Subtitle[]> {
    try {
        const type = season && episode ? 'series' : 'movie';
        const queryId = type === 'series' 
            ? `${imdbId}:${season}:${episode}` 
            : imdbId;

        const url = `${ADDON_URL}/subtitles/${type}/${queryId}.json`;
        console.log(`[SubtitleService] Fetching from ${url}`);

        const response = await gotScraping(url, { responseType: 'json' });
        const data = response.body as { subtitles: any[] };

        if (!data.subtitles || !Array.isArray(data.subtitles)) return [];

        // Parse and filter
        return data.subtitles.map(sub => {
             // Stremio returns lang codes like 'eng', 'pob', 'spa'
             // Convert to readable label if possible, or just use code
             const normalizedLang = normalizeLanguageCode(sub.lang);
             return {
                 id: sub.id,
                 url: sub.url,
                 lang: normalizedLang,
                 label: getLanguageName(normalizedLang)
             };
        });

    } catch (error) {
        console.error('[SubtitleService] Error fetching subtitles:', error);
        return [];
    }
}

function getLanguageName(code: string): string {
    const langs: Record<string, string> = {
        'eng': 'English',
        'spa': 'Spanish',
        'fre': 'French',
        'ger': 'German',
        'ita': 'Italian',
        'por': 'Portuguese',
        'pob': 'Portuguese (Brazil)',
        'rus': 'Russian',
        'jpn': 'Japanese',
        'chi': 'Chinese',
        'ara': 'Arabic',
        'ar': 'Arabic',
        'hin': 'Hindi',
        'kor': 'Korean',
        'tur': 'Turkish',
        'dut': 'Dutch',
        'swe': 'Swedish',
        'pol': 'Polish'
        // Add more as needed
    };
    return langs[code] || code.toUpperCase();
}
