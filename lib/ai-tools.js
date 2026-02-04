// AI Tool implementations for Orb AI Assistant
// These functions are called by the AI when it needs to interact with IMDB or user data

import db from '@/lib/db';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { gotScraping } from 'got-scraping';
import { API_BASE, TIMEOUTS } from '@/lib/api-config';

// SearXNG configuration
const SEARXNG_BASE = process.env.SEARXNG_BASE_URL || 'http://localhost:8888';

/**
 * Search IMDB for movies and TV shows
 * @param {string} query - Search query
 * @returns {Array} Array of title objects with id, title, year, type, rating, poster
 */
export async function searchIMDB(query, limit = 5) {
  try {
    const response = await axios.get(`${API_BASE}/search/titles`, {
      params: { query },
      timeout: TIMEOUTS.QUICK
    });

    const titles = response.data.titles || response.data.results || [];

    return titles.slice(0, limit).map(t => ({
      id: t.id,
      title: t.primaryTitle || t.title,
      year: t.startYear || t.year,
      type: t.type || t.titleType,
      rating: t.rating?.aggregateRating || t.averageRating || null,
      voteCount: t.rating?.voteCount || t.numVotes || null,
      poster: t.primaryImage?.url || t.poster || null
    }));
  } catch (error) {
    console.error('IMDB search error:', error.message);
    return [];
  }
}

/**
 * Batch search IMDB for multiple titles in parallel
 * Used for Fast-Path architecture - resolves all candidates in one tool call
 * @param {Array} queries - Array of search queries (strings or {query, year} objects)
 * @returns {Array} Array of resolved titles with full metadata
 */
export async function batchSearchMedia(queries) {
  if (!Array.isArray(queries) || queries.length === 0) {
    return [];
  }

  // Increased limit for larger batches (throttled internally)
  const MAX_BATCH_SIZE = 100;
  const limitedQueries = queries.slice(0, MAX_BATCH_SIZE);

  // Helper for delays
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Chunk array to avoid rate limits
  const chunkArray = (arr, size) => {
    const results = [];
    for (let i = 0; i < arr.length; i += size) {
      results.push(arr.slice(i, i + size));
    }
    return results;
  };

  const CONCURRENT_REQUESTS = 2; // reduced concurrency to be very safe
  const DELAY_BETWEEN_CHUNKS = 1500; // 1.5s delay between chunks

  // Helper with retry logic for rate limits and transient network errors
  const fetchWithRetry = async (query, params) => {
    const MAX_RETRIES = 4;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        return await axios.get(`${API_BASE}/search/titles`, {
          params,
          timeout: TIMEOUTS.DEFAULT
        });
      } catch (error) {
        const status = error.response?.status;
        const isRateLimit = status === 429;
        const isNetworkError = !status;

        if ((isRateLimit || isNetworkError) && i < MAX_RETRIES - 1) {
          // Exponential backoff: 2s, 4s, 8s, 16s
          const waitTime = 2000 * Math.pow(2, i);
          const reason = isRateLimit ? 'rate limit 429' : 'network error';
          console.warn(`Batch search ${reason} for "${query}". Retrying in ${waitTime}ms...`);
          await delay(waitTime);
          continue;
        }

        throw error;
      }
    }
  };

  try {
    const batchedResults = [];
    const chunks = chunkArray(limitedQueries, CONCURRENT_REQUESTS);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Process current chunk in parallel
        const chunkResults = await Promise.all(
            chunk.map(async (queryItem) => {
                const query = typeof queryItem === 'string' ? queryItem : queryItem.query;
                const year = typeof queryItem === 'object' ? queryItem.year : null;
        
                try {
                  const response = await fetchWithRetry(query, { query });
        
                  const titles = response.data.titles || response.data.results || [];
        
                  if (titles.length === 0) {
                    return { query, found: false, title: null };
                  }
        
                  // If year provided, try to find best match
                  let bestMatch = titles[0];
                  if (year) {
                    const yearMatch = titles.find(t =>
                      (t.startYear || t.year) === year ||
                      (t.startYear || t.year) === parseInt(year)
                    );
                    if (yearMatch) bestMatch = yearMatch;
                  }
                  
                  return {
                    query,
                    found: true,
                    title: {
                      id: bestMatch.id,
                      title: bestMatch.primaryTitle || bestMatch.title,
                      year: bestMatch.startYear || bestMatch.year,
                      type: bestMatch.type || bestMatch.titleType,
                      rating: bestMatch.rating?.aggregateRating || bestMatch.averageRating || null,
                      voteCount: bestMatch.rating?.voteCount || bestMatch.numVotes || null,
                      poster: bestMatch.primaryImage?.url || bestMatch.poster || null,
                      plot: bestMatch.plot || bestMatch.overview || null
                    }
                  };
                } catch (error) {
                  // If rate limited (429) or network error after retries, return error but allow others to proceed
                  const status = error.response?.status;
                  const isRateLimit = status === 429;
                  const isNetworkError = !status;
                  const errorMsg = isRateLimit
                    ? 'Rate limit exceeded'
                    : (error.message || 'Network error');
                  const errTag = isRateLimit ? '429' : (isNetworkError ? 'NET' : 'ERR');
                  console.error(`Batch search error for "${query}" (${errTag}):`, error.message || 'Network error');
                  return { query, found: false, title: null, error: errorMsg };
                }
              })
        );
        
        batchedResults.push(...chunkResults);

        // Add delay if not the last chunk
        if (i < chunks.length - 1) {
            await delay(DELAY_BETWEEN_CHUNKS);
        }
    }

    return batchedResults;
  } catch (error) {
    console.error('Batch search media error:', error.message);
    return [];
  }
}

/**
 * Get detailed information about a specific title
 * @param {string} imdbId - IMDB ID (e.g., tt0111161)
 * @returns {Object} Title details object
 */
export async function getTitleDetails(imdbId) {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const MAX_RETRIES = 3;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await axios.get(`${API_BASE}/titles/${imdbId}`, {
        timeout: TIMEOUTS.DEFAULT
      });

      const data = response.data;

      return {
        id: data.id,
        title: data.primaryTitle || data.title,
        year: data.startYear || data.year,
        endYear: data.endYear || null,
        type: data.type || data.titleType,
        plot: data.plot || data.overview || null,
        genres: data.genres || [],
        rating: data.rating?.aggregateRating || data.averageRating || null,
        voteCount: data.rating?.voteCount || data.numVotes || null,
        runtime: data.runtimeSeconds ? Math.floor(data.runtimeSeconds / 60) : null,
        poster: data.primaryImage?.url || data.poster || null,
        isAdult: data.isAdult || false
      };
    } catch (error) {
      const status = error.response?.status;
      // Retry on 429 (Too Many Requests) or 5xx (Server Error) or network timeouts
      const shouldRetry = status === 429 || (status >= 500 && status < 600) || error.code === 'ECONNABORTED';
      
      if (shouldRetry && i < MAX_RETRIES - 1) {
        const waitTime = 1000 * Math.pow(2, i); // 1s, 2s, 4s
        console.warn(`Get title details retry ${i+1}/${MAX_RETRIES} for ${imdbId} after ${status || error.code}`);
        await delay(waitTime);
        continue;
      }

      // Keep logs clean: Only error log if it's not a 404 (Not Found)
      if (status !== 404) {
        console.error('Get title details error:', error.message);
      }
      return null;
    }
  }
  return null;
}

/**
 * Get all user lists with their contents, enriched with title metadata and ratings
 * @param {string} userId - User ID to scope the query
 * @returns {Array} Array of list objects with names, title counts, and detailed items
 */
export async function getUserLists(userId) {
  try {
    const lists = db.prepare('SELECT id, name FROM lists WHERE user_id = ? ORDER BY created_at ASC').all(userId);
    const result = [];

    for (const list of lists) {
      const items = db.prepare(`
        SELECT DISTINCT li.title_id 
        FROM list_items li 
        WHERE li.list_id = ? 
        ORDER BY li.added_at DESC
      `).all(list.id);

      // Get ratings for these items only if items exist
      let ratingMap = new Map();
      if (items.length > 0) {
        const placeholders = items.map(() => '?').join(',');
        const ratings = db.prepare(`
          SELECT title_id, score, review 
          FROM ratings 
          WHERE user_id = ? AND title_id IN (${placeholders})
        `).all(userId, ...items.map(i => i.title_id));
        ratingMap = new Map(ratings.map(r => [r.title_id, { score: r.score, review: r.review }]));
      }

      result.push({
        id: list.id,
        name: list.name,
        titleIds: items.map(i => i.title_id),
        count: items.length,
        itemsWithMetadata: items.map(i => ({
          titleId: i.title_id,
          rating: ratingMap.get(i.title_id) || null
        }))
      });
    }

    return result;
  } catch (error) {
    console.error('Get user lists error:', error.message);
    return [];
  }
}

/**
 * Get all user ratings with title information
 * @param {string} userId - User ID to scope the query
 * @returns {Array} Array of rating objects with title_id, score, review, and rated_at
 */
export async function getUserRatings(userId) {
  try {
    const ratings = db.prepare(
      'SELECT title_id, score, review, rated_at FROM ratings WHERE user_id = ? ORDER BY rated_at DESC'
    ).all(userId);
    
    return ratings;
  } catch (error) {
    console.error('Get user ratings error:', error.message);
    return [];
  }
}

function normalizeListName(listName) {
  return (listName || '').trim();
}

function getListByName(userId, listName) {
  const normalized = normalizeListName(listName);
  if (!normalized) return null;
  return db.prepare('SELECT id, name FROM lists WHERE user_id = ? AND name = ?').get(userId, normalized) || null;
}

function getOrCreateList(userId, listName, createIfMissing) {
  const normalized = normalizeListName(listName);
  if (!normalized) return null;

  const existing = getListByName(userId, normalized);
  if (existing) return existing;
  if (!createIfMissing) return null;

  const info = db.prepare('INSERT INTO lists (name, user_id) VALUES (?, ?)').run(normalized, userId);
  return { id: info.lastInsertRowid, name: normalized };
}

/**
 * Get the watch status and rating of a specific title for the user
 * Check which lists it's in and if it has a rating
 * @param {string} userId - User ID
 * @param {string} titleId - Title ID to check
 * @returns {Object} Watch status object with lists and rating info
 */
export async function getTitleWatchStatus(userId, titleId) {
  try {
    // Find which lists this title is in
    const lists = db.prepare(`
      SELECT DISTINCT l.id, l.name 
      FROM lists l 
      JOIN list_items li ON l.id = li.list_id 
      WHERE l.user_id = ? AND li.title_id = ?
    `).all(userId, titleId);

    // Get rating if exists
    const rating = db.prepare(
      'SELECT score, review, rated_at FROM ratings WHERE user_id = ? AND title_id = ?'
    ).get(userId, titleId);

    return {
      titleId,
      lists: lists.map(l => ({ id: l.id, name: l.name })),
      rating: rating || null,
      isWatched: lists.some(l => l.name === 'Watched'),
      isWatching: lists.some(l => l.name === 'Watching'),
      isToWatch: lists.some(l => l.name === 'To Watch'),
      isFavorite: lists.some(l => l.name === 'Favorites')
    };
  } catch (error) {
    console.error('Get title watch status error:', error.message);
    return null;
  }
}

/**
 * Search user's lists for items matching a query
 * @param {string} userId - User ID
 * @param {string} query - Search query (will search title IDs)
 * @returns {Array} Array of matching titles from user's lists
 */
export async function searchUserLists(userId, query) {
  try {
    const likeQuery = `%${query}%`;
    const items = db.prepare(`
      SELECT DISTINCT li.title_id
      FROM list_items li
      JOIN lists l ON li.list_id = l.id
      WHERE l.user_id = ? AND li.title_id LIKE ?
      LIMIT 20
    `).all(userId, likeQuery);

    return items.map(i => ({ titleId: i.title_id }));
  } catch (error) {
    console.error('Search user lists error:', error.message);
    return [];
  }
}

/**
 * Add a title to a user's list
 * @param {string} userId - User ID
 * @param {string} listName - Name of the list (Watched, Watching, To Watch, Favorites)
 * @param {string} titleId - IMDB title ID
 * @returns {Object} Result object with success status and message
 */
export async function addToList(userId, listName, titleId, options = {}) {
  try {
    const createIfMissing = options.createIfMissing !== false;
    const list = getOrCreateList(userId, listName, createIfMissing);

    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    const existing = db.prepare('SELECT id FROM list_items WHERE list_id = ? AND title_id = ?').get(list.id, titleId);

    if (existing) {
      return { success: true, message: `${titleId} is already in ${listName}` };
    }

    db.prepare('INSERT INTO list_items (list_id, title_id) VALUES (?, ?)').run(list.id, titleId);

    return { success: true, message: `Added ${titleId} to ${listName}` };
  } catch (error) {
    console.error('Add to list error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Add multiple titles to a user's list with progress callback
 * @param {string} userId - User ID
 * @param {string} listName - Name of the list
 * @param {Array} titleIds - Array of IMDB title IDs
 * @param {Object} options - Options for creation and progress
 * @returns {Object} Result with counts and ids
 */
export async function bulkAddToList(userId, listName, titleIds, options = {}) {
  try {
    const createIfMissing = options.createIfMissing !== false;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const maxItems = typeof options.maxItems === 'number' ? options.maxItems : 200;
    const chunkSize = typeof options.chunkSize === 'number' ? options.chunkSize : 10;

    if (!Array.isArray(titleIds) || titleIds.length === 0) {
      return { success: false, message: 'No titles provided', added: 0, skipped: 0, total: 0 };
    }

    const cleaned = titleIds.filter(Boolean).slice(0, maxItems);
    const list = getOrCreateList(userId, listName, createIfMissing);

    if (!list) {
      return { success: false, message: `List "${listName}" not found`, added: 0, skipped: 0, total: cleaned.length };
    }

    const placeholders = cleaned.map(() => '?').join(',');
    const existing = db.prepare(
      `SELECT title_id FROM list_items WHERE list_id = ? AND title_id IN (${placeholders})`
    ).all(list.id, ...cleaned);
    const existingSet = new Set(existing.map(e => e.title_id));
    const toAdd = cleaned.filter(id => !existingSet.has(id));

    const insertStmt = db.prepare('INSERT INTO list_items (list_id, title_id) VALUES (?, ?)');
    const insertChunk = db.transaction((chunk) => {
      for (const id of chunk) {
        insertStmt.run(list.id, id);
      }
    });

    let processed = 0;
    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize).filter(id => !existingSet.has(id));
      if (chunk.length > 0) {
        insertChunk(chunk);
      }
      processed = Math.min(i + chunkSize, cleaned.length);
      if (onProgress) {
        onProgress({ completed: processed, total: cleaned.length });
      }
    }

    return {
      success: true,
      listId: list.id,
      added: toAdd.length,
      skipped: existingSet.size,
      total: cleaned.length
    };
  } catch (error) {
    console.error('Bulk add to list error:', error.message);
    return { success: false, message: error.message, added: 0, skipped: 0, total: 0 };
  }
}

/**
 * Remove a title from a user's list
 */
export async function removeFromList(userId, listName, titleId) {
  try {
    const list = getListByName(userId, listName);
    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    const info = db.prepare('DELETE FROM list_items WHERE list_id = ? AND title_id = ?').run(list.id, titleId);
    return { success: true, removed: info.changes, listId: list.id, titleId };
  } catch (error) {
    console.error('Remove from list error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Remove multiple titles from a user's list
 */
export async function bulkRemoveFromList(userId, listName, titleIds) {
  try {
    const list = getListByName(userId, listName);
    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    if (!Array.isArray(titleIds) || titleIds.length === 0) {
      return { success: false, message: 'No titles provided', removed: 0 };
    }

    const cleaned = titleIds.filter(Boolean);
    if (cleaned.length === 0) return { success: false, message: 'No valid titles provided', removed: 0 };

    const placeholders = cleaned.map(() => '?').join(',');
    const info = db.prepare(`DELETE FROM list_items WHERE list_id = ? AND title_id IN (${placeholders})`)
      .run(list.id, ...cleaned);

    return { success: true, removed: info.changes, listId: list.id };
  } catch (error) {
    console.error('Bulk remove from list error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Clear all titles from a user's list
 */
export async function clearList(userId, listName) {
  try {
    const list = getListByName(userId, listName);
    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    const info = db.prepare('DELETE FROM list_items WHERE list_id = ?').run(list.id);
    return { success: true, cleared: info.changes, listId: list.id };
  } catch (error) {
    console.error('Clear list error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Delete a user's list
 */
export async function deleteList(userId, listName) {
  try {
    const list = getListByName(userId, listName);
    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    const info = db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(list.id, userId);
    return { success: true, deleted: info.changes, listId: list.id };
  } catch (error) {
    console.error('Delete list error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Move a title between lists
 */
export async function moveBetweenLists(userId, fromListName, toListName, titleId, options = {}) {
  try {
    const createToList = options.createToList !== false;
    const fromList = getListByName(userId, fromListName);
    const toList = getOrCreateList(userId, toListName, createToList);

    if (!fromList) {
      return { success: false, message: `List "${fromListName}" not found` };
    }

    if (!toList) {
      return { success: false, message: `List "${toListName}" not found` };
    }

    const existingTarget = db.prepare('SELECT id FROM list_items WHERE list_id = ? AND title_id = ?')
      .get(toList.id, titleId);

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM list_items WHERE list_id = ? AND title_id = ?').run(fromList.id, titleId);
      if (!existingTarget) {
        db.prepare('INSERT INTO list_items (list_id, title_id) VALUES (?, ?)').run(toList.id, titleId);
      }
    });

    tx();

    return {
      success: true,
      fromListId: fromList.id,
      toListId: toList.id,
      titleId
    };
  } catch (error) {
    console.error('Move between lists error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Batch watch status for multiple titles
 */
export async function getWatchStatusBatch(userId, titleIds) {
  try {
    if (!Array.isArray(titleIds) || titleIds.length === 0) {
      return [];
    }

    const cleaned = titleIds.filter(Boolean);
    const placeholders = cleaned.map(() => '?').join(',');

    const listRows = db.prepare(`
      SELECT li.title_id, l.name
      FROM list_items li
      JOIN lists l ON l.id = li.list_id
      WHERE l.user_id = ? AND li.title_id IN (${placeholders})
    `).all(userId, ...cleaned);

    const ratingRows = db.prepare(`
      SELECT title_id, score, review, rated_at
      FROM ratings
      WHERE user_id = ? AND title_id IN (${placeholders})
    `).all(userId, ...cleaned);

    const listMap = new Map();
    for (const row of listRows) {
      if (!listMap.has(row.title_id)) listMap.set(row.title_id, []);
      listMap.get(row.title_id).push(row.name);
    }

    const ratingMap = new Map(ratingRows.map(r => [r.title_id, r]));

    return cleaned.map(titleId => {
      const lists = listMap.get(titleId) || [];
      return {
        titleId,
        lists,
        rating: ratingMap.get(titleId) || null,
        isWatched: lists.includes('Watched'),
        isWatching: lists.includes('Watching'),
        isToWatch: lists.includes('To Watch'),
        isFavorite: lists.includes('Favorites')
      };
    });
  } catch (error) {
    console.error('Watch status batch error:', error.message);
    return [];
  }
}

/**
 * Save a rating for a title
 * @param {string} userId - User ID
 * @param {string} titleId - IMDB title ID
 * @param {number} score - Rating from 0-10
 * @param {string} review - Optional review text
 * @returns {Object} Result object with success status
 */
export async function rateTitle(userId, titleId, score, review = '') {
  try {
    if (score < 0 || score > 10) {
      return { success: false, message: 'Score must be between 0 and 10' };
    }

    db.prepare(`
      INSERT INTO ratings (user_id, title_id, score, review, rated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, title_id) DO UPDATE SET score=excluded.score, review=excluded.review, rated_at=CURRENT_TIMESTAMP
    `).run(userId, titleId, score, review || null);

    return { success: true, message: `Rated ${titleId} with score ${score}`, score };
  } catch (error) {
    console.error('Rate title error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Extract URLs from DuckDuckGo search results
 */
/**
 * Search using SearXNG metasearch engine
 * Based on orb project's search logic, but using SearXNG instead of Google
 */
async function searchSearXNG(query) {
  try {
    console.log(`[searchSearXNG] Searching: ${query}`);
    
    // SearXNG prefers POST method with form data
    const response = await axios.post(`${SEARXNG_BASE}/search`, 
      new URLSearchParams({
        q: query,
        format: 'json',
        language: 'en',
        time_range: '',
        safesearch: '0',
        categories: 'general'
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      }
    );

    if (!response.data || !response.data.results) {
      console.warn('[searchSearXNG] No results in response');
      return [];
    }

    const results = response.data.results;
    console.log(`[searchSearXNG] Found ${results.length} results`);

    // Extract URLs from results
    const urls = results
      .filter(r => r.url && r.url.startsWith('http'))
      .map(r => r.url)
      .slice(0, 20); // Limit to 20 URLs

    console.log(`[searchSearXNG] Extracted ${urls.length} URLs`);
    return urls;
  } catch (error) {
    console.error(`[searchSearXNG] Error:`, error.message);
    if (error.response) {
      console.error(`[searchSearXNG] Response status:`, error.response.status);
    }
    return [];
  }
}

/**
 * Crawl a URL using got-scraping (like curl_cffi)
 * Extract main content from HTML
 */
async function crawlUrl(url) {
  try {
    console.log(`[crawlUrl] Fetching ${url}`);
    
    const response = await gotScraping({
      url,
      method: 'GET',
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        devices: ['desktop'],
        locales: ['en-US'],
        operatingSystems: ['windows']
      },
      timeout: { request: 10000 },
      retry: { limit: 0 }
    });

    if (!response.body || response.body.length < 100) {
      console.log(`[crawlUrl] Content too small`);
      return null;
    }

    const $ = cheerio.load(response.body);
    
    // Remove unwanted elements (like BeautifulSoup decompose)
    $('script, style, noscript, meta, link, svg, iframe, nav, footer, header, aside').remove();
    $('.ad, .advertisement, .sidebar, .nav-menu, [style*="display:none"], [hidden]').remove();

    // Try to get main content - similar to Python version
    let text = '';
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.article-body',
      '.entry-content',
      '#content',
      '.container'
    ];
    
    for (const selector of contentSelectors) {
      const elem = $(selector).first();
      if (elem.length) {
        const content = elem.text();
        if (content && content.length > 200) {
          text = content;
          break;
        }
      }
    }

    // Fallback to body
    if (!text || text.length < 200) {
      text = $('body').text();
    }

    // Clean whitespace (like Python version)
    text = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove very long repeated characters
    text = text.replace(/(.)\1{20,}/g, '');

    // Limit to 2000 chars (similar to Python version's 1500-2500 range)
    text = text.substring(0, 2000);

    if (text.length < 100) {
      console.log(`[crawlUrl] Text too short: ${text.length} chars`);
      return null;
    }

    const title = $('title').text() || $('h1').first().text() || 'Untitled';
    
    console.log(`[crawlUrl] Success: ${text.length} chars from ${url}`);

    return {
      url,
      title: title.substring(0, 200).trim(),
      content: text
    };
  } catch (error) {
    console.warn(`[crawlUrl] Failed ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Perform web search using Google + got-scraping (orb project approach)
 * Searches Google, extracts URLs, crawls them in parallel
 */
export async function webSearch(query) {
  try {
    console.log(`[Web Search] Starting search for: "${query}"`);
    
    if (!query || query.trim().length === 0) {
      return { text: 'Please provide a search query.', sources: [] };
    }

    // Search SearXNG for URLs
    console.log(`[Web Search] Searching SearXNG...`);
    const urls = await searchSearXNG(query);

    if (urls.length === 0) {
      console.log(`[Web Search] No URLs found from SearXNG`);
      return {
        text: `I couldn't find any search results for "${query}". Please try a different query.`,
        sources: []
      };
    }

    console.log(`[Web Search] Found ${urls.length} URLs, crawling top 10 in parallel...`);

    // Crawl top 10 URLs in parallel (like orb project)
    const crawlPromises = urls.slice(0, 10).map(url => crawlUrl(url));
    const crawlResults = await Promise.all(crawlPromises);
    
    // Filter out failed crawls
    const validResults = crawlResults.filter(r => r !== null && r.content && r.content.length > 50);

    if (validResults.length === 0) {
      console.log(`[Web Search] All crawls failed or returned no content`);
      return {
        text: `Found search results but couldn't extract content from any pages. Try a different query.`,
        sources: []
      };
    }

    console.log(`[Web Search] Successfully crawled ${validResults.length} pages`);

    // Format results for AI (like orb's web_search output)
    const formattedResults = validResults
      .map((result, idx) => `### Source ${idx + 1}: ${result.title}\n**URL:** ${result.url}\n**Content:** ${result.content}`)
      .join('\n\n---\n\n');

    return {
      text: `## Web Search Results for "${query}"\n\n${formattedResults}`,
      sources: validResults.map((result) => ({
        title: result.title,
        url: result.url
      }))
    };
  } catch (error) {
    console.error(`[Web Search] Error: ${error.message}`);
    return {
      text: `Web search encountered an error: ${error.message}. Please try again.`,
      sources: []
    };
  }
}

/**
 * Streaming version of web search - calls onSource callback for each result
 * Used for live favicon updates during search
 */
export async function webSearchStreaming(query, onSource) {
  try {
    console.log(`[Web Search Streaming] Starting search for: "${query}"`);
    
    if (!query || query.trim().length === 0) {
      return { text: 'Please provide a search query.', sources: [] };
    }

    // Search SearXNG for URLs
    console.log(`[Web Search Streaming] Searching SearXNG...`);
    const urls = await searchSearXNG(query);

    if (urls.length === 0) {
      console.log(`[Web Search Streaming] No URLs found from SearXNG`);
      return {
        text: `I couldn't find any search results for "${query}". Please try a different query.`,
        sources: []
      };
    }

    console.log(`[Web Search Streaming] Found ${urls.length} URLs, crawling with streaming updates...`);

    // Crawl top 10 URLs sequentially for streaming updates
    const validResults = [];
    const crawlPromises = urls.slice(0, 10).map(async (url, index) => {
      try {
        const result = await crawlUrl(url);
        if (result && result.content && result.content.length > 50) {
          const source = {
            title: result.title,
            url: result.url
          };
          validResults.push(source);
          // Call onSource callback immediately when result is available
          if (onSource) {
            onSource(source);
          }
          return result;
        }
      } catch (e) {
        console.error(`[Web Search Streaming] Error crawling ${url}:`, e.message);
      }
      return null;
    });

    // Wait for all crawls to complete
    await Promise.all(crawlPromises);

    if (validResults.length === 0) {
      console.log(`[Web Search Streaming] All crawls failed or returned no content`);
      return {
        text: `Found search results but couldn't extract content from any pages. Try a different query.`,
        sources: []
      };
    }

    console.log(`[Web Search Streaming] Successfully crawled ${validResults.length} pages`);

    // Format results for AI
    const formattedResults = validResults
      .map((source, idx) => `### Source ${idx + 1}: ${source.title}\n**URL:** ${source.url}`)
      .join('\n\n---\n\n');

    return {
      text: `## Web Search Results for "${query}"\n\n${formattedResults}`,
      sources: validResults
    };
  } catch (error) {
    console.error(`[Web Search Streaming] Error: ${error.message}`);
    return {
      text: `Web search encountered an error: ${error.message}. Please try again.`,
      sources: []
    };
  }
}

/**
 * Execute a tool by name with given arguments
 * Tools are called from the AI in the chat streaming handler
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Arguments for the tool
 * @param {string} userId - User ID for scoped operations
 * @returns {Object} Result of the tool execution
 */
export async function executeTool(toolName, args, userId = null, options = {}) {
  switch (toolName) {
    case 'web_search':
      return await webSearch(args.query);
    case 'search_imdb':
      return await searchIMDB(args.query, args.limit);
    case 'batch_search_media':
      return await batchSearchMedia(args.queries);
    case 'get_title_details':
      return await getTitleDetails(args.imdb_id);
    case 'get_user_lists':
      return userId ? await getUserLists(userId) : [];
    case 'get_user_ratings':
      return userId ? await getUserRatings(userId) : [];
    case 'get_title_watch_status':
      return userId ? await getTitleWatchStatus(userId, args.title_id) : null;
    case 'search_user_lists':
      return userId ? await searchUserLists(userId, args.query) : [];
    case 'add_to_list':
      return userId
        ? await addToList(userId, args.list_name, args.title_id, { createIfMissing: true })
        : { success: false, message: 'User not authenticated' };
    case 'bulk_add_to_list':
      return userId
        ? await bulkAddToList(userId, args.list_name, args.title_ids, options)
        : { success: false, message: 'User not authenticated' };
    case 'remove_from_list':
      return userId
        ? await removeFromList(userId, args.list_name, args.title_id)
        : { success: false, message: 'User not authenticated' };
    case 'bulk_remove_from_list':
      return userId
        ? await bulkRemoveFromList(userId, args.list_name, args.title_ids)
        : { success: false, message: 'User not authenticated' };
    case 'clear_list':
      return userId
        ? await clearList(userId, args.list_name)
        : { success: false, message: 'User not authenticated' };
    case 'delete_list':
      return userId
        ? await deleteList(userId, args.list_name)
        : { success: false, message: 'User not authenticated' };
    case 'move_between_lists':
      return userId
        ? await moveBetweenLists(userId, args.from_list, args.to_list, args.title_id, { createToList: true })
        : { success: false, message: 'User not authenticated' };
    case 'get_watch_status_batch':
      return userId
        ? await getWatchStatusBatch(userId, args.title_ids)
        : [];
    case 'rate_title':
      return userId ? await rateTitle(userId, args.title_id, args.score, args.review) : { success: false, message: 'User not authenticated' };
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
