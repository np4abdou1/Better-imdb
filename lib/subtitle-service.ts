// Service to fetch subtitles from Stremio's OpenSubtitles v3 addon mirror

// Official Stremio OpenSubtitles v3 Addon URL
const ADDON_URL = 'https://opensubtitles-v3.strem.io';
const SUBTITLE_CACHE_TTL_MS = 2 * 60 * 1000;
const DEBUG_SUBTITLE_LOGS = process.env.DEBUG_SUBTITLE_LOGS === '1';

const subtitleCache = new Map<string, { expiresAt: number; data: Subtitle[] }>();
const subtitlePending = new Map<string, Promise<Subtitle[]>>();

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

        const cacheKey = `${type}:${queryId}`;
        const cached = subtitleCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }

        const pending = subtitlePending.get(cacheKey);
        if (pending) return pending;

        const promise = (async () => {
            const url = `${ADDON_URL}/subtitles/${type}/${queryId}.json`;
            if (DEBUG_SUBTITLE_LOGS) {
                console.log(`[SubtitleService] Fetching from ${url}`);
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                signal: controller.signal,
                cache: 'no-store'
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`Subtitle fetch failed: ${response.status}`);
            }

            const data = await response.json() as { subtitles: any[] };
            if (!data.subtitles || !Array.isArray(data.subtitles)) return [];

            const parsed = data.subtitles.map(sub => {
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

            subtitleCache.set(cacheKey, {
                expiresAt: Date.now() + SUBTITLE_CACHE_TTL_MS,
                data: parsed,
            });

            return parsed;
        })();

        subtitlePending.set(cacheKey, promise);
        try {
            return await promise;
        } finally {
            subtitlePending.delete(cacheKey);
        }

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
