// Multi-provider subtitle service
// Fetches from 3 Stremio subtitle addons in parallel:
// 1. OpenSubtitles v3 Pro (dexter21767)
// 2. SubSource (strem.top)
// 3. SubDL (strem.top)

const PROVIDERS = [
  { id: 'opensubtitles', name: 'OpenSubtitles', baseUrl: 'https://opensubtitlesv3-pro.dexter21767.com' },
  { id: 'subsource', name: 'SubSource', baseUrl: 'https://subsource.strem.top' },
  { id: 'subdl', name: 'SubDL', baseUrl: 'https://subdl.strem.top' },
] as const;

const SUBTITLE_CACHE_TTL_MS = 3 * 60 * 1000;
const DEBUG_SUBTITLE_LOGS = process.env.DEBUG_SUBTITLE_LOGS === '1';

export interface Subtitle {
    id: string;
    url: string;
    lang: string;           // ISO 639-2 (e.g., 'eng', 'ara')
    label: string;          // Human readable (e.g., 'English', 'Arabic')
    provider: string;       // Source provider name
    hearingImpaired?: boolean;
}

const subtitleCache = new Map<string, { expiresAt: number; data: Subtitle[] }>();
const subtitlePending = new Map<string, Promise<Subtitle[]>>();

function normalizeLanguageCode(code?: string | null): string {
    const value = (code || '').trim().toLowerCase();
    const aliases: Record<string, string> = {
        ar: 'ara', arabic: 'ara', arb: 'ara',
        en: 'eng', english: 'eng',
        es: 'spa', spanish: 'spa',
        fr: 'fre', french: 'fre', fra: 'fre',
        de: 'ger', german: 'ger', deu: 'ger',
        it: 'ita', italian: 'ita',
        pt: 'por', portuguese: 'por',
        'pt-br': 'pob', 'pt-BR': 'pob',
        ru: 'rus', russian: 'rus',
        ja: 'jpn', japanese: 'jpn',
        ko: 'kor', korean: 'kor',
        zh: 'chi', chinese: 'chi', zho: 'chi',
        hi: 'hin', hindi: 'hin',
        tr: 'tur', turkish: 'tur',
        nl: 'dut', dutch: 'dut', nld: 'dut',
        sv: 'swe', swedish: 'swe',
        pl: 'pol', polish: 'pol',
        vi: 'vie', vietnamese: 'vie',
        th: 'tha', thai: 'tha',
        fi: 'fin', finnish: 'fin',
        no: 'nor', norwegian: 'nor',
        da: 'dan', danish: 'dan',
        he: 'heb', hebrew: 'heb',
        hu: 'hun', hungarian: 'hun',
        cs: 'cze', czech: 'cze', ces: 'cze',
        ro: 'rum', romanian: 'rum', ron: 'rum',
        el: 'gre', greek: 'gre', ell: 'gre',
        id: 'ind', indonesian: 'ind',
        ms: 'may', malay: 'may', msa: 'may',
        uk: 'ukr', ukrainian: 'ukr',
        bg: 'bul', bulgarian: 'bul',
        hr: 'hrv', croatian: 'hrv',
        sr: 'srp', serbian: 'srp',
    };
    return aliases[value] || value || 'unknown';
}

const LANG_NAMES: Record<string, string> = {
    eng: 'English', spa: 'Spanish', fre: 'French', ger: 'German',
    ita: 'Italian', por: 'Portuguese', pob: 'Portuguese (BR)',
    rus: 'Russian', jpn: 'Japanese', chi: 'Chinese', ara: 'Arabic',
    hin: 'Hindi', kor: 'Korean', tur: 'Turkish', dut: 'Dutch',
    swe: 'Swedish', pol: 'Polish', vie: 'Vietnamese', tha: 'Thai',
    fin: 'Finnish', nor: 'Norwegian', dan: 'Danish', heb: 'Hebrew',
    hun: 'Hungarian', cze: 'Czech', rum: 'Romanian', gre: 'Greek',
    ind: 'Indonesian', may: 'Malay', ukr: 'Ukrainian', bul: 'Bulgarian',
    hrv: 'Croatian', srp: 'Serbian', cat: 'Catalan', slv: 'Slovenian',
    per: 'Persian', fas: 'Persian', ben: 'Bengali',
    tam: 'Tamil', tel: 'Telugu', urd: 'Urdu', est: 'Estonian',
    lat: 'Latvian', lit: 'Lithuanian', glg: 'Galician', bos: 'Bosnian',
    alb: 'Albanian', sqi: 'Albanian', mac: 'Macedonian', mkd: 'Macedonian',
    geo: 'Georgian', kat: 'Georgian', arm: 'Armenian', hye: 'Armenian',
    ice: 'Icelandic', isl: 'Icelandic', sin: 'Sinhala',
    mal: 'Malayalam', kan: 'Kannada', mar: 'Marathi', pan: 'Punjabi',
};

function getLanguageName(code: string): string {
    return LANG_NAMES[code] || code.toUpperCase();
}

async function fetchFromProvider(
    provider: typeof PROVIDERS[number],
    type: string,
    queryId: string
): Promise<Subtitle[]> {
    try {
        const url = `${provider.baseUrl}/subtitles/${type}/${queryId}.json`;
        
        if (DEBUG_SUBTITLE_LOGS) {
            console.log(`[SubtitleService] Fetching from ${provider.name}: ${url}`);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: controller.signal,
            cache: 'no-store'
        });

        clearTimeout(timeout);

        if (!response.ok) {
            if (DEBUG_SUBTITLE_LOGS) {
                console.warn(`[SubtitleService] ${provider.name} returned ${response.status}`);
            }
            return [];
        }

        const data = await response.json() as { subtitles?: any[] };
        if (!data.subtitles || !Array.isArray(data.subtitles)) return [];

        return data.subtitles.map((sub, idx) => {
            const normalizedLang = normalizeLanguageCode(sub.lang);
            const isHI = /hearing.impair|sdh|\bhi\b|\bcc\b/i.test(sub.id || '');
            
            return {
                id: `${provider.id}-${sub.id || idx}`,
                url: sub.url,
                lang: normalizedLang,
                label: getLanguageName(normalizedLang),
                provider: provider.name,
                hearingImpaired: isHI || undefined,
            };
        });
    } catch (error: any) {
        if (DEBUG_SUBTITLE_LOGS) {
            console.error(`[SubtitleService] ${provider.name} error:`, error.message);
        }
        return [];
    }
}

export async function getMultiProviderSubtitles(
    imdbId: string,
    season?: number,
    episode?: number
): Promise<Subtitle[]> {
    const type = season != null && episode != null ? 'series' : 'movie';
    const queryId = type === 'series' ? `${imdbId}:${season}:${episode}` : imdbId;
    const cacheKey = `multi:${type}:${queryId}`;

    // Check cache
    const cached = subtitleCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    // Deduplicate concurrent requests
    const pending = subtitlePending.get(cacheKey);
    if (pending) return pending;

    const promise = (async () => {
        // Fetch from all providers in parallel
        const results = await Promise.allSettled(
            PROVIDERS.map(provider => fetchFromProvider(provider, type, queryId))
        );

        const allSubs: Subtitle[] = [];
        for (const result of results) {
            if (result.status === 'fulfilled') {
                allSubs.push(...result.value);
            }
        }

        if (DEBUG_SUBTITLE_LOGS) {
            const counts = PROVIDERS.map((p, i) => {
                const r = results[i];
                return `${p.name}: ${r.status === 'fulfilled' ? r.value.length : 'error'}`;
            });
            console.log(`[SubtitleService] Results: ${counts.join(', ')} (Total: ${allSubs.length})`);
        }

        // Deduplicate: keep top 3 per language across all providers
        const byLang = new Map<string, Subtitle[]>();
        for (const sub of allSubs) {
            const key = sub.lang;
            if (!byLang.has(key)) byLang.set(key, []);
            byLang.get(key)!.push(sub);
        }

        const deduped: Subtitle[] = [];
        for (const [, subs] of byLang) {
            // Sort: OpenSubtitles first, then SubDL, then SubSource
            const providerOrder = { OpenSubtitles: 0, SubDL: 1, SubSource: 2 };
            subs.sort((a, b) => {
                const orderA = providerOrder[a.provider as keyof typeof providerOrder] ?? 9;
                const orderB = providerOrder[b.provider as keyof typeof providerOrder] ?? 9;
                return orderA - orderB;
            });
            deduped.push(...subs.slice(0, 3));
        }

        subtitleCache.set(cacheKey, {
            expiresAt: Date.now() + SUBTITLE_CACHE_TTL_MS,
            data: deduped,
        });

        return deduped;
    })();

    subtitlePending.set(cacheKey, promise);
    try {
        return await promise;
    } finally {
        subtitlePending.delete(cacheKey);
    }
}

// Legacy compatibility export (used by subtitles route)
export async function getOpenSubtitles(imdbId: string, season?: number, episode?: number): Promise<Subtitle[]> {
    return getMultiProviderSubtitles(imdbId, season, episode);
}
