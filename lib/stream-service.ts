import { getDb } from './db';
import { API_BASE } from './api-config';
import { StreamMapping } from '@/types';
import { topCinemaScraper } from './topcinema-scraper';
import { vidTubeProcessor } from './vidtube-processor';

/**
 * Ensure URL is properly encoded for safe HTTP transmission
 * Note: got-scraping expects URLs in their raw Unicode form
 * but standard HTTP requires percent-encoding
 */
function ensureUrlEncoded(url: string): string {
  try {
    // Check if URL has non-ASCII characters (Arabic/CJK etc)
    if (/[^\x00-\x7F]/.test(url)) {
      // If already percent-encoded, return as-is
      if (url.includes('%')) {
        return url;
      }
      // Encode non-ASCII characters
      return encodeURI(url);
    }
    // Already ASCII-safe, return as-is
    return url;
  } catch {
    return url;
  }
}

// Helper for Levenshtein distance
const levenshtein = (a: string, b: string): number => {
  if (!a || !b) return 100;
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  
  const track = Array(s2.length + 1).fill(null).map(() =>
    Array(s1.length + 1).fill(null));
  
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return track[s2.length][s1.length];
};

const normalize = (str: string): string => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const hasJapaneseScript = (str?: string | null): boolean => {
  if (!str) return false;
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(str);
};

const checkSimilarity = (title1?: string | null, title2?: string | null): boolean => {
  const t1 = normalize(title1 || '');
  const t2 = normalize(title2 || '');
  if (t1 && t2) {
    if (t1 === t2) return true;
    const dist = levenshtein(t1, t2);
    const maxLength = Math.max(t1.length, t2.length);
    const similarity = 1 - dist / maxLength;
    return similarity > 0.7; // 70% matching threshold
  }

  const raw1 = (title1 || '').trim().toLowerCase();
  const raw2 = (title2 || '').trim().toLowerCase();
  if (!raw1 || !raw2) return false;
  if (raw1 === raw2) return true;
  if (raw1.length >= 4 && raw2.length >= 4) {
    return raw1.includes(raw2) || raw2.includes(raw1);
  }
  return false;
};

// Database interactions
const getMapping = async (imdbId: string): Promise<StreamMapping | undefined> => {
  try {
    const db = await getDb();
    const mapping = await db.collection<StreamMapping>('stream_mappings').findOne({ imdb_id: imdbId });
    return mapping || undefined;
  } catch (err) {
    console.error('Error fetching stream mapping:', err);
    return undefined;
  }
};

const saveMapping = async (imdbId: string, providerId: string, type: string, metadata: any = null) => {
  try {
    const db = await getDb();
    await db.collection<StreamMapping>('stream_mappings').updateOne(
      { imdb_id: imdbId },
      {
        $set: {
          provider_id: providerId,
          type,
          metadata
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('Error saving stream mapping:', err);
  }
};

// Direct TypeScript scraper functions (replaces Python API calls)
// These functions accept a log callback for streaming responses
const searchContent = async (query: string, type?: 'movie' | 'series' | 'anime', logFn?: (msg: string) => void): Promise<any[]> => {
  try {
    return await topCinemaScraper.search(query, type);
  } catch (error: any) {
    if (logFn) logFn(`[TopCinema] Search error: ${error.message}`);
    console.error(`[TopCinema] Search error:`, error.message);
    return [];
  }
};

const getShowDetails = async (url: string, logFn?: (msg: string) => void): Promise<any> => {
  try {
    return await topCinemaScraper.getShowDetails(url);
  } catch (error: any) {
    if (logFn) logFn(`[TopCinema] Show details error: ${error.message}`);
    console.error(`[TopCinema] Show details error:`, error.message);
    return null;
  }
};

const getSeasonEpisodes = async (url: string, logFn?: (msg: string) => void): Promise<any[]> => {
  try {
    const decodedUrl = decodeURIComponent(url);
    if (logFn) {
      logFn(`[getSeasonEpisodes] Fetching episodes directly from: ${decodedUrl}`);
    }
    
    // Direct scraper call (bypass API route to avoid URL issues)
    const season: any = {
      season_number: 1, // Not strictly needed for scraping list
      display_label: 'Season',
      url: decodedUrl,
      episodes: []
    };
    
    const episodes = await topCinemaScraper.fetchSeasonEpisodes(season);
    
    if (logFn) logFn(`[getSeasonEpisodes] Result: ${episodes.length} episodes`);
    return episodes;
  } catch (error: any) {
    if (logFn) logFn(`[TopCinema] Season episodes error: ${error.message}`);
    console.error(`[TopCinema] Season episodes error:`, error.message);
    return [];
  }
};

const resolveStream = async (url: string, logFn?: (msg: string) => void): Promise<any> => {
  try {
    const episode = { 
      url, 
      episode_number: '1', 
      display_number: '1', 
      title: '', 
      is_special: false, 
      servers: [] 
    };
    
    const servers = await topCinemaScraper.fetchEpisodeServers(episode);
    if (!servers || servers.length === 0) {
      if (logFn) logFn('[TopCinema] No servers found for episode');
      return null;
    }
    
    // Try to extract direct video URL from first VidTube server
    let videoUrl: string | null = null;
    let selectedServer = servers[0];
    
    for (const server of servers) {
      if (server.embed_url) {
        videoUrl = await vidTubeProcessor.extract(server.embed_url, url);
        if (videoUrl) {
          selectedServer = server;
          break;
        }
      }
    }
    
    return {
      video_url: videoUrl,
      embed_url: selectedServer.embed_url,
      server_number: selectedServer.server_number,
      headers: {
        'Referer': selectedServer.embed_url,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
  } catch (error: any) {
    if (logFn) logFn(`[TopCinema] Stream resolve error: ${error.message}`);
    console.error(`[TopCinema] Stream resolve error:`, error.message);
    return null;
  }
};


export interface StreamParams {
  imdbId: string;
  title: string;
  originalTitle?: string;
  japaneseTitle?: string | null;
  year?: number | string;
  type: string;
  isAnime?: boolean;
  season?: number;
  episode?: number;
  onLog?: ((message: string) => void) | null;
}

// Core Logic: Resolve Stream Logic
export const getStreamForTitle = async ({ imdbId, title, originalTitle, japaneseTitle, year, type, isAnime, season = 1, episode = 1, onLog = null }: StreamParams) => {
  const log = (message: string) => {
    if (onLog) onLog(message);
    console.log(message);
  };

  log(`[StreamService] Resolving: ${title} (${year}) S${season}E${episode}`);
  
  // 1. Check DB Mapping
  const mapping: StreamMapping | undefined = await getMapping(imdbId);
  let providerUrl: string | undefined = mapping?.provider_id;
  if (providerUrl) providerUrl = decodeURIComponent(providerUrl);
  
  // 2. If no mapping, Search & Sync
  if (!providerUrl) {
    log('[StreamService] No mapping found. Searching provider...');
    
    // Determine the most accurate search type
    let searchType: 'movie' | 'series' | 'anime' = type === 'movie' ? 'movie' : 'series';
    if (isAnime) {
        searchType = 'anime';
    }
    
    // Strategy: Try primary English title first
    let lastQuery: string | undefined = title;
    let searchResults: any[] = await searchContent(lastQuery, searchType, log);
    
    // If we searched for 'anime' and found nothing, maybe fallback to 'series' just in case
    if ((!searchResults || searchResults.length === 0) && isAnime) {
         log(`[StreamService] No anime results for "${title}". Retrying as 'series'...`);
         lastQuery = title;
         searchResults = await searchContent(lastQuery, 'series', log);
    }

    // Strategy: If no results and anime, try Japanese title
    if ((!searchResults || searchResults.length === 0) && isAnime && japaneseTitle && japaneseTitle !== title) {
      log(`[StreamService] No results for "${title}". Trying Japanese title: "${japaneseTitle}"`);
      lastQuery = japaneseTitle;
      searchResults = await searchContent(lastQuery, searchType, log);
    }

    // If we tried Japanese title and still nothing, try as series
    if ((!searchResults || searchResults.length === 0) && isAnime && japaneseTitle && japaneseTitle !== title) {
      log('[StreamService] No results for Japanese title. Retrying as series...');
      lastQuery = japaneseTitle;
      searchResults = await searchContent(lastQuery, 'series', log);
    }

    // Strategy: If no results, try original title (non-anime or Japanese script only)
    if ((!searchResults || searchResults.length === 0) && originalTitle && originalTitle !== title) {
      const allowOriginal = !isAnime || hasJapaneseScript(originalTitle);
      if (allowOriginal) {
        log(`[StreamService] No results for "${title}". Trying original title: "${originalTitle}"`);
        lastQuery = originalTitle;
        searchResults = await searchContent(lastQuery, searchType, log);
      }
    }

    // Strategy: Split by Colon (For "Lord of the Rings: Fellowship...", "Mission: Impossible - ...")
    if ((!searchResults || searchResults.length === 0) && title.includes(':')) {
        const parts = title.split(':');
        // Try the distinct parts. Usually the specific subtitle is more unique (e.g. "Fellowship of the Ring")
        // But sometimes the prefix is the brand (e.g. "Mission: Impossible")
        
        // Part 2 (Subtitle) - Priority if long enough
        if (parts[1] && parts[1].trim().length > 3) {
             const subtitle = parts[1].trim();
             log(`[StreamService] No results. Trying subtitle: "${subtitle}"`);
               lastQuery = subtitle;
               searchResults = await searchContent(lastQuery, searchType, log);
        }
        
        // Part 1 (Prefix) - Fallback
        if ((!searchResults || searchResults.length === 0) && parts[0] && parts[0].trim().length > 3) {
             const prefix = parts[0].trim();
             log(`[StreamService] No results. Trying prefix: "${prefix}"`);
             lastQuery = prefix;
             searchResults = await searchContent(lastQuery, searchType, log);
        }
    }
    
    // Strategy: If still no results, try Arabic query logic (future improvement)
    // or try removing special chars
    
    if (!searchResults || searchResults.length === 0) {
      log(`[StreamService] No search results found for query: ${title}`);
      return null;
    }
    log(`[StreamService] Found ${searchResults.length} results.`);

    let validMatch: any = null;

    // Iterate through candidates to find the BEST match, not just the first one
    for (const res of searchResults) {
        // 1. Type Check (Strict for Anime)
        if (isAnime) {
             // Strict Pass: If we have anime results available, reject non-anime
             const hasAnimeResults = searchResults.some(r => r.type === 'anime');
             if (hasAnimeResults && res.type !== 'anime') {
                 // Skip non-anime result (like Live Action)
                 continue;
             }
        } else {
             // For non-anime request, strictly reject anime results
             if (res.type === 'anime') continue; 
        }

        if (searchType === 'movie' && res.type !== 'movie' && !isAnime) continue;

        // 2. Year Check (Crucial for One Piece)
        let candidateYear = res.year;
        
        // If year is missing in search result, fetch details to confirm
        // Only do this if title similarity is high to save bandwidth
        if (!candidateYear && checkSimilarity(title, res.title)) {
             log(`[StreamService] Fetching details for candidate "${res.title}" (missing year)...`);
             const details = await getShowDetails(res.url, log);
             if (details && details.year) {
                 candidateYear = details.year;
             }
        }

        if (year && candidateYear) {
            const y1 = parseInt(String(year));
            const y2 = parseInt(String(candidateYear));
            if (Math.abs(y1 - y2) > 1) {
                log(`[StreamService] Rejecting "${res.title}" due to year mismatch (${y1} vs ${y2})`);
                continue;
            }
        } else if (year && !candidateYear) {
            // Use with caution if we still can't find year
            log(`[StreamService] Warning: Could not verify year for "${res.title}".`);
        }

        // 3. Title Similarity
        const queryMatchesTitle = lastQuery && lastQuery.length >= 4 &&
          res.title?.toLowerCase().includes(lastQuery.toLowerCase());

        if (!checkSimilarity(title, res.title) && 
          (!originalTitle || !checkSimilarity(originalTitle, res.title)) &&
          (!japaneseTitle || !checkSimilarity(japaneseTitle, res.title)) &&
          !queryMatchesTitle) {
            continue;
        }

        // 4. Type Preference tie-breaker
        // If we want anime, and this is 'series', but we haven't found a better match yet, keep it?
        // But if we want anime and this is 'anime', it's a strong match.
        if (isAnime && res.type === 'anime') {
            validMatch = res;
            break; // Strong match found
        }
        
        if (!validMatch) validMatch = res;
    }

    if (validMatch) {
      log(`[StreamService] Found match: ${validMatch.title} (${validMatch.year || 'N/A'})`);
      // Decode URL to prevent double encoding in subsequent calls
      providerUrl = decodeURIComponent(validMatch.url);
      
      // Fetch details to cache metadata (seasons etc)
      let metadata: any = {};
      const details = await getShowDetails(providerUrl, log);
      if (details) {
         metadata = {
           year: details.year,
           seasons_count: details.seasons?.length || 0,
         };
      }
      
      await saveMapping(imdbId, providerUrl, type, metadata);
    } else {
        log('[StreamService] No suitable match found after filtering.');
        return null;
    }
  } else {
      log(`[StreamService] Using cached mapping: ${providerUrl}`);
  }

  // 3. Resolve Stream URL

  if (!providerUrl) return null;

  // Handling Movies vs Series
  let targetUrl = providerUrl;

  if (type === 'tv' || type === 'series') {
    // We need to drill down to the episode
    // Note: Provider details usually give us season URLs.
    
    // We might have cached details, but for now let's just fetch details again to be safe
    // Optimization: Cache seasons list in metadata
    const details = await getShowDetails(providerUrl);
    if (!details) return null;

    // --- ADVANCED SEASON/EPISODE RESOLUTION ---
    log(`[StreamService] Resolving Season ${season} Episode ${episode} for: ${details.title}`);
    
    // Check for cached season counts to enable O(1) lookup
    const meta = mapping?.metadata;
    const seasonCounts = (typeof meta === 'object' && meta) ? (meta as any).season_counts as Record<string, number> : undefined;
    let targetEpData: any = null;
    let seasonsToScan: any[] = [];
    
    // 1. Determine Scope (Single Season vs All Seasons)
    // Strategy: Flatten Seasons for Long-Running Anime (One Piece, Conan, etc.)
    const useAbsoluteNumbering = isAnime && Number(season) === 1 && details.seasons.length > 1;

    if (useAbsoluteNumbering) {
        log(`[StreamService] Detected Multi-Season Anime (IMDb "Season 1"). Scanning all ${details.seasons.length} provider seasons.`);
        seasonsToScan = [...details.seasons];
        seasonsToScan.sort((a,b) => parseInt(a.season_number) - parseInt(b.season_number));
    } else {
        // Standard Behavior
        seasonsToScan = details.seasons.filter((s: any) => parseInt(s.season_number) === Number(season));
        // Add split parts
        if (isAnime || Number(season) >= 4) {
             const parts = details.seasons.filter((s: any) => parseInt(s.season_number) >= 100);
             parts.sort((a: any, b: any) => parseInt(a.season_number) - parseInt(b.season_number));
             for(const p of parts) {
                if (!seasonsToScan.find(c => c.season_number === p.season_number)) {
                    seasonsToScan.push(p);
                }
             }
        }
    }

    // 2. FAST PATH: Use Cached Counts (if available)
    if (useAbsoluteNumbering && seasonCounts) {
        log('[StreamService] Using cached season counts for instant resolution.');
        let absIndex = Number(episode);
        let foundCached = false;

        for (const candSeason of seasonsToScan) {
            const count = seasonCounts[candSeason.season_number];
            if (typeof count === 'number') {
                if (absIndex <= count) {
                    log(`[StreamService] Calculated match: Season ${candSeason.season_number} Relative Ep ${absIndex}`);
                    // Fetch ONLY this season
                    const sEpisodes = await getSeasonEpisodes(candSeason.url, log);
                    // Match logic
                    const directMatch = sEpisodes.find((e: any) => parseInt(e.episode_number) === absIndex);
                    // Fallback to index
                    if (directMatch) targetEpData = directMatch;
                    else if (sEpisodes[absIndex - 1]) targetEpData = sEpisodes[absIndex - 1];
                    
                    foundCached = true;
                    break;
                } else {
                    absIndex -= count;
                }
            } else {
                log(`[StreamService] Cache miss for Season ${candSeason.season_number}. Fallback to scan.`);
                // If cache is partial/corrupt, break and do full scan
                break; 
            }
        }
        
        if (targetEpData) {
            // Success via cache!
            log('[StreamService] Resolution successful via cache.');
        } 
        // If not found via cache (maybe new season?), fall through to scan
    }

    // 3. SLOW PATH: Scan (Sequential or Parallel)
    if (!targetEpData) {
        // If we are scanning MANY seasons (e.g. One Piece), use Parallel Batching
        if (seasonsToScan.length > 3) {
            log(`[StreamService] Parallel scanning ${seasonsToScan.length} seasons via batching...`);
            
            // Helper to process a batch
            const processBatch = async (batch: any[]) => {
                return Promise.all(batch.map(async (s) => {
                     const eps = await getSeasonEpisodes(s.url, null); // mute logs
                     return { season: s, episodes: eps };
                }));
            };

            const BATCH_SIZE = 5; // Conservative limit
            const allResults: Map<string, any[]> = new Map();
            
            // Build map of Season Number -> Episodes
            for (let i = 0; i < seasonsToScan.length; i += BATCH_SIZE) {
                const batch = seasonsToScan.slice(i, i + BATCH_SIZE);
                log(`[StreamService] Fetching batch ${Math.floor(i/BATCH_SIZE)+1}...`);
                const batchResults = await processBatch(batch);
                batchResults.forEach(r => allResults.set(r.season.season_number, r.episodes));
            }

            // Update Cache Metadata
            const newSeasonCounts: Record<string, number> = {};
            
            // Traverse in order to find episode
            let remainingEpIndex = Number(episode);
            
            for (const candSeason of seasonsToScan) {
                const sEpisodes = allResults.get(candSeason.season_number) || [];
                const count = sEpisodes.length;
                newSeasonCounts[candSeason.season_number] = count;
                
                log(`[StreamService] Season ${candSeason.season_number}: ${count} episodes`);

                if (!targetEpData) {
                    if (remainingEpIndex <= count) {
                         const directMatch = sEpisodes.find((e: any) => parseInt(e.episode_number) === remainingEpIndex);
                         if (directMatch) {
                             targetEpData = directMatch;
                             log(`[StreamService] Found match in Season ${candSeason.season_number}`);
                         } else if (sEpisodes[remainingEpIndex - 1]) {
                             targetEpData = sEpisodes[remainingEpIndex - 1];
                             log(`[StreamService] Found match via index in Season ${candSeason.season_number}`);
                         }
                    } else {
                        remainingEpIndex -= count;
                    }
                }
            }

            // Save the newly built map to DB
            if (Object.keys(newSeasonCounts).length > 0) {
                 // Merge with existing metadata
                 let existingMeta = {};
                 const currentMeta = mapping?.metadata;
                 if (typeof currentMeta === 'object' && currentMeta !== null) {
                     existingMeta = currentMeta;
                 }
                 const newMeta = { ...existingMeta, season_counts: newSeasonCounts };
                 await saveMapping(imdbId, providerUrl, type, newMeta);
                 log('[StreamService] Season counts cached.');
            }

        } else {
            // Simple Sequential Scan (for < 3 seasons)
            // (Keep existing logic but optimized for readability)
            let remainingEpIndex = Number(episode);
            
            for (const candSeason of seasonsToScan) {
                const sUrl = candSeason.url;
                log(`[StreamService] processing season ${candSeason.season_number}...`);
                const sEpisodes = await getSeasonEpisodes(sUrl, log);
                
                if (!sEpisodes || sEpisodes.length === 0) continue;

                if (seasonsToScan.length > 1) {
                     const count = sEpisodes.length;
                     if (remainingEpIndex > count) {
                         remainingEpIndex -= count;
                         continue;
                     }
                      // Find relative match
                     if (sEpisodes[remainingEpIndex - 1]) {
                         targetEpData = sEpisodes[remainingEpIndex - 1];
                         break;
                     }
                }

                // Direct Match (absolute number match inside a season)
                const directMatch = sEpisodes.find((e: any) => parseInt(e.episode_number) === Number(episode)); // check original abs number?
                if (directMatch) {
                     targetEpData = directMatch;
                     break;
                }
                
                // Relative match fallback if above failed
                const relativeMatch = sEpisodes.find((e: any) => parseInt(e.episode_number) === remainingEpIndex);
                if (relativeMatch) {
                    targetEpData = relativeMatch;
                    break;
                }
            }
        }
    }

    if (!targetEpData) {
        log(`[StreamService] Episode ${episode} not found in available seasons.`);
        return null;
    }
    
    // decode episode url
    targetUrl = decodeURIComponent(targetEpData.url);
  } else if (targetUrl.includes('%')) {
      targetUrl = decodeURIComponent(targetUrl);
  }

  log(`[StreamService] Resolving stream for target URL: ${targetUrl}`);
  const streamData = await resolveStream(targetUrl);
  
  if (streamData && streamData.video_url) {
      return {
          streamUrl: streamData.video_url,
          headers: streamData.headers,
          server: streamData.server_number
      };
  }

  return null;
};

// Helper to fetch title info from IMDb API server-side
const getTitleInfo = async (imdbId: string): Promise<any> => {
    try {
        const res = await fetch(`${API_BASE}/titles/${imdbId}`, {
            headers: { 'Accept': 'application/json' },
            next: { revalidate: 3600 }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error('Error fetching title info:', e);
        return null;
    }
};

export const resolveStreamForImdbId = async (imdbId: string, season: number = 1, episode: number = 1, onLog: ((msg: string) => void) | null = null) => {
  const log = (message: string) => {
    if (onLog) onLog(message);
    console.log(message);
  };
    const info = await getTitleInfo(imdbId);
    if (!info) {
    log(`[StreamService] Could not find IMDb info for ${imdbId}`);
        return null;
    }
    
    // Determine type: 'movie' or 'tv'
    // IMDb types: 'movie', 'tvSeries', 'tvMiniSeries' from api.imdbapi.dev
    // The API returns top-level 'type' field (e.g. "tvSeries") or 'titleType.id' in some versions
    
    const typeId = info.type || info.titleType?.id || 'movie';
    const isSeries = typeId === 'tvSeries' || typeId === 'tvMiniSeries' || typeId === 'tvEpisode';
    
    const type = isSeries ? 'series' : 'movie';
    const title = info.titleText?.text || info.originalTitleText?.text || info.primaryTitle || info.title;
    const originalTitle = info.originalTitleText?.text || info.originalTitle;
    const titleCandidates = [
      info.titleText?.text,
      info.originalTitleText?.text,
      info.originalTitle,
      info.primaryTitle,
      info.title
    ].filter(Boolean);
    const japaneseTitle = titleCandidates.find(hasJapaneseScript) || null;
    const year = info.releaseYear?.year || info.startYear || info.year;
    const isAnime = info.genres?.includes('Animation') || info.keywords?.includes('anime');
    
    return getStreamForTitle({
        imdbId,
        title,
        originalTitle,
        japaneseTitle,
        year,
        type,
        isAnime,
        season,
      episode,
      onLog: log
    });
};
