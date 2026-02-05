import db from './db.js';
import { API_BASE } from './api-config.js';
import fs from 'fs';
import path from 'path';

// Python API configuration
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// Helper for Levenshtein distance
const levenshtein = (a, b) => {
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

const normalize = (str) => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const hasJapaneseScript = (str) => {
  if (!str) return false;
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(str);
};

const checkSimilarity = (title1, title2) => {
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
const getMapping = (imdbId) => {
  try {
    return db.prepare('SELECT * FROM stream_mappings WHERE imdb_id = ?').get(imdbId);
  } catch (err) {
    console.error('Error fetching stream mapping:', err);
    return null;
  }
};

const saveMapping = (imdbId, providerId, type, metadata = null) => {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO stream_mappings (imdb_id, provider_id, type, metadata, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(imdbId, providerId, type, metadata ? JSON.stringify(metadata) : null);
  } catch (err) {
    // If table structure mismatch (updated_at vs created_at etc), ignore for now or log
    // The table schema has 'created_at'. Let's avoid custom updated_at if it's not in schema.
    try {
        db.prepare(`
        INSERT OR REPLACE INTO stream_mappings (imdb_id, provider_id, type, metadata)
        VALUES (?, ?, ?, ?)
        `).run(imdbId, providerId, type, metadata ? JSON.stringify(metadata) : null);
    } catch (e2) {
      console.error('Error saving stream mapping:', e2);
    }
  }
};

const updateCachedStream = (imdbId, url, expiresAt) => {
  try {
    db.prepare(`
      UPDATE stream_mappings 
      SET cached_stream_url = ?, expires_at = ?
      WHERE imdb_id = ?
    `).run(url, expiresAt, imdbId);
  } catch (err) {
    console.error('Error updating cached stream:', err);
  }
};

// API Interactions with Python Service
const fetchJson = async (endpoint, params = {}) => {
  const url = new URL(`${PYTHON_API_URL}${endpoint}`);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  
  try {
    const res = await fetch(url.toString(), { 
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 0 } // No caching for internal API calls
    });
    
    if (!res.ok) {
      console.warn(`Python API request failed: ${url} -> ${res.status}`);
      const text = await res.text();
      console.warn('Error body:', text);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error(`Python API error (${endpoint}):`, error.message);
    return null;
  }
};


// Core Logic: Resolve Stream Logic
export const getStreamForTitle = async ({ imdbId, title, originalTitle, japaneseTitle, year, type, isAnime, season = 1, episode = 1, onLog = null }) => {
  const log = (message) => {
    if (onLog) onLog(message);
    console.log(message);
  };

  log(`[StreamService] Resolving: ${title} (${year}) S${season}E${episode}`);
  
  // 1. Check DB Mapping
  let mapping = getMapping(imdbId);
  let providerUrl = mapping?.provider_id;
  if (providerUrl) providerUrl = decodeURIComponent(providerUrl);
  
  // 2. If no mapping, Search & Sync
  if (!providerUrl) {
    log('[StreamService] No mapping found. Searching provider...');
    
    // Determine the most accurate search type
    let searchType = type === 'movie' ? 'movie' : 'series';
    if (isAnime) {
        searchType = 'anime';
    }
    
    // Strategy: Try primary English title first
    let lastQuery = title;
    let searchResults = await fetchJson('/search', { q: lastQuery, type: searchType });
    
    // If we searched for 'anime' and found nothing, maybe fallback to 'series' just in case
    if ((!searchResults || searchResults.length === 0) && isAnime) {
         log(`[StreamService] No anime results for "${title}". Retrying as 'series'...`);
         lastQuery = title;
         searchResults = await fetchJson('/search', { q: lastQuery, type: 'series' });
    }

    // Strategy: If no results and anime, try Japanese title
    if ((!searchResults || searchResults.length === 0) && isAnime && japaneseTitle && japaneseTitle !== title) {
      log(`[StreamService] No results for "${title}". Trying Japanese title: "${japaneseTitle}"`);
      lastQuery = japaneseTitle;
      searchResults = await fetchJson('/search', { q: lastQuery, type: searchType });
    }

    // If we tried Japanese title and still nothing, try as series
    if ((!searchResults || searchResults.length === 0) && isAnime && japaneseTitle && japaneseTitle !== title) {
      log('[StreamService] No results for Japanese title. Retrying as series...');
      lastQuery = japaneseTitle;
      searchResults = await fetchJson('/search', { q: lastQuery, type: 'series' });
    }

    // Strategy: If no results, try original title (non-anime or Japanese script only)
    if ((!searchResults || searchResults.length === 0) && originalTitle && originalTitle !== title) {
      const allowOriginal = !isAnime || hasJapaneseScript(originalTitle);
      if (allowOriginal) {
        log(`[StreamService] No results for "${title}". Trying original title: "${originalTitle}"`);
        lastQuery = originalTitle;
        searchResults = await fetchJson('/search', { q: lastQuery, type: searchType });
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
               searchResults = await fetchJson('/search', { q: lastQuery, type: searchType });
        }
        
        // Part 1 (Prefix) - Fallback
        if ((!searchResults || searchResults.length === 0) && parts[0] && parts[0].trim().length > 3) {
             const prefix = parts[0].trim();
             log(`[StreamService] No results. Trying prefix: "${prefix}"`);
             lastQuery = prefix;
             searchResults = await fetchJson('/search', { q: lastQuery, type: searchType });
        }
    }
    
    // Strategy: If still no results, try Arabic query logic (future improvement)
    // or try removing special chars
    
    if (!searchResults || searchResults.length === 0) {
      log(`[StreamService] No search results found for query: ${title}`);
      return null;
    }
    log(`[StreamService] Found ${searchResults.length} results.`);

    let validMatch = null;

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
             const details = await fetchJson('/show/details', { url: res.url });
             if (details && details.year) {
                 candidateYear = details.year;
             }
        }

        if (year && candidateYear) {
            const y1 = parseInt(year);
            const y2 = parseInt(candidateYear);
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
      let metadata = {};
      const details = await fetchJson('/show/details', { url: providerUrl });
      if (details) {
         metadata = {
           year: details.year,
           seasons_count: details.seasons?.length || 0,
         };
      }
      
      saveMapping(imdbId, providerUrl, type, metadata);
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
    const details = await fetchJson('/show/details', { url: providerUrl });
    if (!details) return null;

    // --- ADVANCED SEASON/EPISODE RESOLUTION ---
    log(`[StreamService] Resolving Season ${season} Episode ${episode} for: ${details.title}`);
    
    let targetEpData = null;
    
    // 1. Gather Candidate Seasons
    let candidateSeasons = [];
    
    // Strategy: Flatten Seasons for Long-Running Anime (One Piece, Conan, etc.)
    // If IMDb calls it "Season 1" but provider has multiple seasons, use ALL of them.
    if (isAnime && parseInt(season) === 1 && details.seasons.length > 1) {
        log(`[StreamService] Detected Multi-Season Anime (IMDb "Season 1"). Scanning all ${details.seasons.length} provider seasons.`);
        candidateSeasons = [...details.seasons];
        candidateSeasons.sort((a,b) => parseInt(a.season_number) - parseInt(b.season_number));
    } else {
        // Standard Behavior
        candidateSeasons = details.seasons.filter(s => parseInt(s.season_number) === parseInt(season));
    }
    
    // Include split-season parts (S100+) for Anime or later seasons
    // (Existing AOT logic - combines with above if needed, but above usually covers it if we took all)
    // Actually, we should merge unique parts if not already present
    if (isAnime || parseInt(season) >= 4) {
        const parts = details.seasons.filter(s => parseInt(s.season_number) >= 100);
        // Sort parts ascending
        parts.sort((a,b) => parseInt(a.season_number) - parseInt(b.season_number));
        
        for(const p of parts) {
            if (!candidateSeasons.find(c => c.season_number === p.season_number)) {
                candidateSeasons.push(p);
            }
        }
    }

    // 2. Iterate and Search
    let remainingEpIndex = parseInt(episode);
    
    for (const candSeason of candidateSeasons) {
        const sUrl = decodeURIComponent(candSeason.url);
        
        const sEpisodes = await fetchJson('/season/episodes', { url: sUrl });
        if (!sEpisodes || sEpisodes.length === 0) {
            log(`[StreamService] No episodes found for Season ${candSeason.season_number}`);
            continue;
        }

        // A. Direct Match
        const directMatch = sEpisodes.find(e => parseInt(e.episode_number) === remainingEpIndex);
        if (directMatch) {
            log(`[StreamService] Found DIRECT match in Season ${candSeason.season_number}: Ep ${directMatch.episode_number}`);
            targetEpData = directMatch;
            break; 
        }

        // B. Relative Match (Split Seasons)
        if (candidateSeasons.length > 1) {
            const count = sEpisodes.length;
            if (remainingEpIndex > count) {
                remainingEpIndex -= count;
                log(`[StreamService] Ep ${episode} exceeds Season ${candSeason.season_number} count (${count}). Checking next part for Ep ${remainingEpIndex}`);
                continue; 
            }
            // If strictly inside range but not found directly, maybe it's mislabeled.
            // Try lenient match (via index)
             if (sEpisodes[remainingEpIndex - 1]) {
                 log(`[StreamService] Found via index fallback: Ep ${sEpisodes[remainingEpIndex-1].episode_number}`);
                 targetEpData = sEpisodes[remainingEpIndex - 1];
                 break;
             }
            
            break;
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
  const streamData = await fetchJson('/stream/resolve', { url: targetUrl });
  
  if (streamData) {
      return {
          streamUrl: streamData.video_url,
          headers: streamData.headers,
          server: streamData.server_number
      };
  }

  return null;
};

// Helper to fetch title info from IMDb API server-side
const getTitleInfo = async (imdbId) => {
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

export const resolveStreamForImdbId = async (imdbId, season = 1, episode = 1, onLog = null) => {
  const log = (message) => {
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
