// AI Tool implementations for Orb AI Assistant
// These functions are called by the AI when it needs to interact with IMDB or user data

import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import axios from 'axios';
import { API_BASE, TIMEOUTS } from '@/lib/api-config';
import { searchWebUrls, crawlUrl } from '@/lib/search-service';
import { getStreamForTitle } from '@/lib/stream-service';

// --- Interfaces for Tool Arguments ---

export interface SearchIMDBArgs {
  query: string;
  limit?: number;
}

export interface BatchSearchQuery {
  query: string;
  year?: number | string | null;
}

export interface BatchSearchMediaArgs {
  queries: (string | BatchSearchQuery)[];
}

export interface GetTitleDetailsArgs {
  imdb_id: string;
}

export interface AddToListArgs {
  list_name: string;
  title_id: string;
}

export interface BulkAddToListArgs {
  list_name: string;
  title_ids: string[];
  confirmed?: boolean;
}

export interface RemoveFromListArgs {
  list_name: string;
  title_id: string;
}

export interface BulkRemoveFromListArgs {
  list_name: string;
  title_ids: string[];
  confirmed?: boolean;
}

export interface ClearListArgs {
  list_name: string;
  confirmed?: boolean;
}

export interface DeleteListArgs {
  list_name: string;
  confirmed?: boolean;
}

export interface MoveBetweenListsArgs {
  from_list: string;
  to_list: string;
  title_id: string;
}

export interface RateTitleArgs {
  title_id: string;
  score: number;
  review?: string;
}

export interface CrawlSpecificUrlsArgs {
  url?: string;
  urls?: string[];
}

export interface GetStreamLinkArgs {
  imdb_id?: string;
  title?: string;
  season?: number;
  episode?: number;
  year?: number;
}

export interface WebSearchArgs {
  query: string;
}

export interface TitleWatchStatusArgs {
  title_id: string;
}

export interface SearchUserListsArgs {
  query: string;
}

export interface WatchStatusBatchArgs {
  title_ids: string[];
}


// --- Tool Implementations ---

/**
 * Search IMDB for movies and TV shows
 */
export async function searchIMDB(query: string, limit: number = 5): Promise<any[]> {
  try {
    const response = await axios.get(`${API_BASE}/search/titles`, {
      params: { query },
      timeout: TIMEOUTS.QUICK
    });

    const titles = response.data.titles || response.data.results || [];

    return titles.slice(0, limit).map((t: any) => ({
      id: t.id,
      title: t.primaryTitle || t.title,
      year: t.startYear || t.year,
      type: t.type || t.titleType,
      rating: t.rating?.aggregateRating || t.averageRating || null,
      voteCount: t.rating?.voteCount || t.numVotes || null,
      poster: t.primaryImage?.url || t.poster || null
    }));
  } catch (error: any) {
    console.error('IMDB search error:', error.message);
    return [];
  }
}

/**
 * Batch search IMDB for multiple titles in parallel
 */
export async function batchSearchMedia(queries: (string | BatchSearchQuery)[]): Promise<any[]> {
  if (!Array.isArray(queries) || queries.length === 0) {
    return [];
  }

  const MAX_BATCH_SIZE = 100;
  const limitedQueries = queries.slice(0, MAX_BATCH_SIZE);
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const chunkArray = (arr: any[], size: number) => {
    const results = [];
    for (let i = 0; i < arr.length; i += size) {
      results.push(arr.slice(i, i + size));
    }
    return results;
  };

  const CONCURRENT_REQUESTS = 2;
  const DELAY_BETWEEN_CHUNKS = 1500;

  const fetchWithRetry = async (query: string, params: any) => {
    const MAX_RETRIES = 4;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        return await axios.get(`${API_BASE}/search/titles`, {
          params,
          timeout: TIMEOUTS.DEFAULT
        });
      } catch (error: any) {
        const status = error.response?.status;
        const isRateLimit = status === 429;
        const isNetworkError = !status;

        if ((isRateLimit || isNetworkError) && i < MAX_RETRIES - 1) {
          const waitTime = 2000 * Math.pow(2, i);
          const reason = isRateLimit ? 'rate limit 429' : 'network error';
          console.warn(`Batch search ${reason} for "${query}". Retrying in ${waitTime}ms...`);
          await delay(waitTime);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded'); 
  };

  try {
    const batchedResults: any[] = [];
    const chunks = chunkArray(limitedQueries, CONCURRENT_REQUESTS);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        const chunkResults = await Promise.all(
            chunk.map(async (queryItem: string | BatchSearchQuery) => {
                const query = typeof queryItem === 'string' ? queryItem : queryItem.query;
                const year = typeof queryItem === 'object' ? queryItem.year : null;
        
                try {
                  const response = await fetchWithRetry(query, { query });
                  const titles = response.data.titles || response.data.results || [];
        
                  if (titles.length === 0) {
                    return { query, found: false, title: null };
                  }
        
                  let bestMatch = titles[0];
                  if (year) {
                    const yearMatch = titles.find((t: any) =>
                      (t.startYear || t.year) === year ||
                      (t.startYear || t.year) === parseInt(year as string)
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
                } catch (error: any) {
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

        if (i < chunks.length - 1) {
            await delay(DELAY_BETWEEN_CHUNKS);
        }
    }

    return batchedResults;
  } catch (error: any) {
    console.error('Batch search media error:', error.message);
    return [];
  }
}

/**
 * Get detailed information about a specific title
 */
export async function getTitleDetails(imdbId: string): Promise<any> {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
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
    } catch (error: any) {
      const status = error.response?.status;
      const shouldRetry = status === 429 || (status >= 500 && status < 600) || error.code === 'ECONNABORTED';
      
      if (shouldRetry && i < MAX_RETRIES - 1) {
        const waitTime = 1000 * Math.pow(2, i);
        console.warn(`Get title details retry ${i+1}/${MAX_RETRIES} for ${imdbId} after ${status || error.code}`);
        await delay(waitTime);
        continue;
      }

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
 */
export async function getUserLists(userId: string): Promise<any[]> {
  try {
    const db = await getDb();
    const lists = await db.collection('lists').find({ user_id: userId }).sort({ created_at: 1 }).toArray();
    const result = [];

    for (const list of lists) {
      const listId = list._id; // ObjectId
      const items = await db.collection('list_items')
        .find({ list_id: listId.toString() }) // Assuming list_items uses string implementation of list_id now for easier handling, or we can use match
        .sort({ added_at: -1 })
        .toArray();
      
      // Fallback: if we stored list_id as ObjectId in list_items, we should query that way.
      // But in this migration, I'll store list_id as string in list_items to match SQLite expectations of text IDs mostly.
      // Or safer: query both ways if unsure, but I'll stick to stringifying ObjectIds when storing references.
      
      // Note: In addToList, I'll use list._id.toString()
      // But wait! If I migrated auth.js to insert objects, list._id is ObjectId.
      // And in SQLite list.id was number.
      // So lists have changed from number IDs to ObjectId (or UUID strings).
      
      // Let's standardise: list_id in list_items should allow finding items. 
      // If items were inserted with numeric IDs by SQLite, they are strings now? No, we started fresh or are rewriting.
      // The user wants migration. Old data is SQLite. New data is Mongo.
      // I'll assume we are building FOR Mongo now.
      
      let itemsList = items;
      if (items.length === 0) {
          // try checking with ObjectId if string failed 
          itemsList = await db.collection('list_items')
           .find({ list_id: listId }) 
           .sort({ added_at: -1 })
           .toArray();
      }

      // Get unique title IDs
      const uniqueTitleIds = Array.from(new Set(itemsList.map(i => i.title_id)));

      // Get ratings
      let ratingMap = new Map();
      if (uniqueTitleIds.length > 0) {
        const ratings = await db.collection('ratings')
          .find({ user_id: userId, title_id: { $in: uniqueTitleIds } })
          .toArray();
        ratingMap = new Map(ratings.map(r => [r.title_id, { score: r.score, review: r.review }]));
      }

      result.push({
        id: listId.toString(),
        name: list.name,
        titleIds: uniqueTitleIds,
        count: uniqueTitleIds.length,
        itemsWithMetadata: uniqueTitleIds.map(tid => ({
          titleId: tid,
          rating: ratingMap.get(tid) || null
        }))
      });
    }

    return result;
  } catch (error: any) {
    console.error('Get user lists error:', error.message);
    return [];
  }
}

/**
 * Get all user ratings with title information
 */
export async function getUserRatings(userId: string): Promise<any[]> {
  try {
    const db = await getDb();
    const ratings = await db.collection('ratings')
        .find({ user_id: userId })
        .sort({ rated_at: -1 })
        .toArray();
    
    return ratings;
  } catch (error: any) {
    console.error('Get user ratings error:', error.message);
    return [];
  }
}

function normalizeListName(listName: string): string {
  return (listName || '').trim();
}

async function getListByName(userId: string, listName: string): Promise<any> {
  const normalized = normalizeListName(listName);
  if (!normalized) return null;
  const db = await getDb();
  return await db.collection('lists').findOne({ user_id: userId, name: normalized });
}

async function getOrCreateList(userId: string, listName: string, createIfMissing: boolean): Promise<any> {
  const normalized = normalizeListName(listName);
  if (!normalized) return null;

  let list = await getListByName(userId, normalized);
  if (list) return list;
  if (!createIfMissing) return null;

  const db = await getDb();
  const result = await db.collection('lists').insertOne({
      name: normalized,
      user_id: userId,
      created_at: new Date()
  });
  
  return { _id: result.insertedId, name: normalized, user_id: userId };
}

/**
 * Get the watch status and rating of a specific title for the user
 */
export async function getTitleWatchStatus(userId: string, titleId: string): Promise<any> {
  try {
    const db = await getDb();
    
    // Find all list items for this user and title
    // Need to join with lists to verify user ownership if we strictly follow schema, 
    // or rely on lists being user-scoped and list_items only linking effectively.
    // Better to fetch user lists first, then check matches.
    
    const userLists = await db.collection('lists').find({ user_id: userId }).toArray();
    const userListIds = userLists.map(l => l._id.toString());
    const userListIdsObj = userLists.map(l => l._id);
    
    const items = await db.collection('list_items').find({ 
        title_id: titleId,
        list_id: { $in: [...userListIds, ...userListIdsObj] } 
    }).toArray();

    const matchedListIds = new Set(items.map(i => i.list_id.toString()));
    const matchingLists = userLists.filter(l => matchedListIds.has(l._id.toString()));

    const rating = await db.collection('ratings').findOne({ user_id: userId, title_id: titleId });

    return {
      titleId,
      lists: matchingLists.map(l => ({ id: l._id.toString(), name: l.name })),
      rating: rating || null,
      isWatched: matchingLists.some(l => l.name === 'Watched'),
      isWatching: matchingLists.some(l => l.name === 'Watching'),
      isToWatch: matchingLists.some(l => l.name === 'To Watch'),
      isFavorite: matchingLists.some(l => l.name === 'Favorites')
    };
  } catch (error: any) {
    console.error('Get title watch status error:', error.message);
    return null;
  }
}

/**
 * Search user's lists for items matching a query (ID)
 */
export async function searchUserLists(userId: string, query: string): Promise<any[]> {
  try {
    // Only searching by ID pattern here as per original code 'LIKE %query%' on title_id
    const db = await getDb();
    const userLists = await db.collection('lists').find({ user_id: userId }).toArray();
    const userListIds = userLists.map(l => l._id.toString());
    const userListIdsObj = userLists.map(l => l._id);

    const items = await db.collection('list_items').find({
        list_id: { $in: [...userListIds, ...userListIdsObj] },
        title_id: { $regex: query, $options: 'i' }
    }).limit(20).toArray();

    // distinct
    const distinct = Array.from(new Set(items.map(i => i.title_id)));
    return distinct.map(titleId => ({ titleId }));
  } catch (error: any) {
    console.error('Search user lists error:', error.message);
    return [];
  }
}

interface AddToListOptions {
    createIfMissing?: boolean;
}

/**
 * Add a title to a user's list
 */
export async function addToList(userId: string, listName: string, titleId: string, options: AddToListOptions = {}): Promise<any> {
  try {
    const createIfMissing = options.createIfMissing !== false;
    const list = await getOrCreateList(userId, listName, createIfMissing);

    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    const db = await getDb();
    const listIdStr = list._id.toString();
    
    // Check existing
    // Check both string and object id to be safe during valid transitions
    const existing = await db.collection('list_items').findOne({ 
        list_id: { $in: [listIdStr, list._id] }, 
        title_id: titleId 
    });

    if (existing) {
      return { success: true, message: `${titleId} is already in ${listName}` };
    }

    await db.collection('list_items').insertOne({
        list_id: listIdStr, // standardize on string references for list items
        title_id: titleId,
        added_at: new Date()
    });

    return { success: true, message: `Added ${titleId} to ${listName}` };
  } catch (error: any) {
    console.error('Add to list error:', error.message);
    return { success: false, message: error.message };
  }
}

interface BulkAddOptions {
    createIfMissing?: boolean;
    onProgress?: ((progress: {completed: number, total: number}) => void) | null;
    maxItems?: number;
    chunkSize?: number;
}

/**
 * Add multiple titles to a user's list with progress callback
 */
export async function bulkAddToList(userId: string, listName: string, titleIds: string[], options: BulkAddOptions = {}): Promise<any> {
  try {
    const createIfMissing = options.createIfMissing !== false;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const maxItems = typeof options.maxItems === 'number' ? options.maxItems : 200;
    const chunkSize = typeof options.chunkSize === 'number' ? options.chunkSize : 10;

    if (!Array.isArray(titleIds) || titleIds.length === 0) {
      return { success: false, message: 'No titles provided', added: 0, skipped: 0, total: 0 };
    }

    const cleaned = titleIds.filter(Boolean).slice(0, maxItems);
    const list = await getOrCreateList(userId, listName, createIfMissing);

    if (!list) {
      return { success: false, message: `List "${listName}" not found`, added: 0, skipped: 0, total: cleaned.length };
    }

    const db = await getDb();
    const listIdStr = list._id.toString();

    // Check existing
    const existingItems = await db.collection('list_items').find({
        list_id: { $in: [listIdStr, list._id] },
        title_id: { $in: cleaned }
    }).toArray();

    const existingSet = new Set(existingItems.map(e => e.title_id));
    const toAdd = cleaned.filter(id => !existingSet.has(id));

    if (toAdd.length > 0) {
        const docs = toAdd.map(id => ({
            list_id: listIdStr,
            title_id: id,
            added_at: new Date()
        }));
        
        await db.collection('list_items').insertMany(docs);
    }
    
    // Simulate chunk progress for API consistency
    if (onProgress) {
        onProgress({ completed: cleaned.length, total: cleaned.length });
    }

    return {
      success: true,
      listId: list._id.toString(),
      added: toAdd.length,
      skipped: existingSet.size,
      total: cleaned.length
    };
  } catch (error: any) {
    console.error('Bulk add to list error:', error.message);
    return { success: false, message: error.message, added: 0, skipped: 0, total: 0 };
  }
}

/**
 * Remove a title from a user's list
 */
export async function removeFromList(userId: string, listName: string, titleId: string): Promise<any> {
  try {
    const list = await getListByName(userId, listName);
    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    const db = await getDb();
    const result = await db.collection('list_items').deleteMany({
        list_id: { $in: [list._id.toString(), list._id] },
        title_id: titleId
    });

    return { success: true, removed: result.deletedCount, listId: list._id.toString(), titleId };
  } catch (error: any) {
    console.error('Remove from list error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Remove multiple titles from a user's list
 */
export async function bulkRemoveFromList(userId: string, listName: string, titleIds: string[]): Promise<any> {
  try {
    const list = await getListByName(userId, listName);
    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    if (!Array.isArray(titleIds) || titleIds.length === 0) {
      return { success: false, message: 'No titles provided', removed: 0 };
    }

    const cleaned = titleIds.filter(Boolean);
    if (cleaned.length === 0) return { success: false, message: 'No valid titles provided', removed: 0 };

    const db = await getDb();
    const result = await db.collection('list_items').deleteMany({
        list_id: { $in: [list._id.toString(), list._id] },
        title_id: { $in: cleaned }
    });

    return { success: true, removed: result.deletedCount, listId: list._id.toString() };
  } catch (error: any) {
    console.error('Bulk remove from list error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Clear all titles from a user's list
 */
export async function clearList(userId: string, listName: string): Promise<any> {
  try {
    const list = await getListByName(userId, listName);
    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    const db = await getDb();
    const result = await db.collection('list_items').deleteMany({
         list_id: { $in: [list._id.toString(), list._id] }
    });

    return { success: true, cleared: result.deletedCount, listId: list._id.toString() };
  } catch (error: any) {
    console.error('Clear list error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Delete a user's list
 */
export async function deleteList(userId: string, listName: string): Promise<any> {
  try {
    const list = await getListByName(userId, listName);
    if (!list) {
      return { success: false, message: `List "${listName}" not found` };
    }

    // items cascade delete? manually needed in mongo usually unless using transactions/hooks
    const db = await getDb();
    // delete items first
    await db.collection('list_items').deleteMany({
        list_id: { $in: [list._id.toString(), list._id] }
    });
    
    // delete list
    const result = await db.collection('lists').deleteOne({ _id: list._id });

    return { success: true, deleted: result.deletedCount, listId: list._id.toString() };
  } catch (error: any) {
    console.error('Delete list error:', error.message);
    return { success: false, message: error.message };
  }
}

interface MoveOptions {
    createToList?: boolean;
}

/**
 * Move a title between lists
 */
export async function moveBetweenLists(userId: string, fromListName: string, toListName: string, titleId: string, options: MoveOptions = {}): Promise<any> {
  try {
    const createToList = options.createToList !== false;
    const fromList = await getListByName(userId, fromListName);
    const toList = await getOrCreateList(userId, toListName, createToList);

    if (!fromList) {
      return { success: false, message: `List "${fromListName}" not found` };
    }

    if (!toList) {
      return { success: false, message: `List "${toListName}" not found` };
    }

    // In mongo we can do this atomically or simply two ops.
    // Transaction support depends on cluster deployment (replica set).
    // Safest simple way: add then remove.
    
    await addToList(userId, toListName, titleId, { createIfMissing: true });
    await removeFromList(userId, fromListName, titleId);

    return {
      success: true,
      fromListId: fromList._id.toString(),
      toListId: toList._id.toString(),
      titleId
    };
  } catch (error: any) {
    console.error('Move between lists error:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Batch watch status for multiple titles
 */
export async function getWatchStatusBatch(userId: string, titleIds: string[]): Promise<any[]> {
  try {
    if (!Array.isArray(titleIds) || titleIds.length === 0) {
      return [];
    }

    const cleaned = titleIds.filter(Boolean);
    const db = await getDb();
    
    // Get user lists
    const userLists = await db.collection('lists').find({ user_id: userId }).toArray();
    const listMap = new Map(); // ListID -> Name
    userLists.forEach(l => listMap.set(l._id.toString(), l.name));
    userLists.forEach(l => listMap.set(l._id, l.name)); // support object ref too

    const userListIds = Array.from(listMap.keys());
    
    // Get items in these lists matching titles
    const items = await db.collection('list_items').find({
        list_id: { $in: userListIds },
        title_id: { $in: cleaned }
    }).toArray();
    
    const titleToListsMap = new Map();
    items.forEach(item => {
        if (!titleToListsMap.has(item.title_id)) titleToListsMap.set(item.title_id, []);
        const listName = listMap.get(item.list_id.toString()) || listMap.get(item.list_id);
        if (listName) titleToListsMap.get(item.title_id).push(listName);
    });

    const ratings = await db.collection('ratings').find({
        user_id: userId,
        title_id: { $in: cleaned }
    }).toArray();
    
    const ratingMap = new Map(ratings.map(r => [r.title_id, r]));

    return cleaned.map(titleId => {
      const lists: string[] = titleToListsMap.get(titleId) || [];
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
  } catch (error: any) {
    console.error('Watch status batch error:', error.message);
    return [];
  }
}

/**
 * Save a rating for a title
 */
export async function rateTitle(userId: string, titleId: string, score: number, review: string = ''): Promise<any> {
  try {
    if (score < 0 || score > 10) {
      return { success: false, message: 'Score must be between 0 and 10' };
    }

    const db = await getDb();
    await db.collection('ratings').updateOne(
        { user_id: userId, title_id: titleId },
        { 
            $set: { score, review: review || null, rated_at: new Date() }
        },
        { upsert: true }
    );

    return { success: true, message: `Rated ${titleId} with score ${score}`, score };
  } catch (error: any) {
    console.error('Rate title error:', error.message);
    return { success: false, message: error.message };
  }
}

// --- Search Helpers --- 
// Kept same logic
const WEB_SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how',
  'i', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'the', 'to', 'what',
  'when', 'where', 'who', 'why', 'with', 'you', 'your'
]);

function normalizeText(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuery(query: string): string[] {
  const tokens = normalizeText(query)
    .split(' ')
    .filter(Boolean)
    .filter(token => token.length > 2 && !WEB_SEARCH_STOP_WORDS.has(token));

  return Array.from(new Set(tokens));
}

function getAnswerCueScore(query: string, text: string): number {
  const normalized = normalizeText(text);
  const hasScorePattern = /\b\d{1,2}\s*-\s*\d{1,2}\b/.test(normalized);
  const hasVsPattern = /\b(vs|v|versus)\b/.test(normalized);
  const hasResultWord = /\b(result|score|final|winner|match|game)\b/.test(normalized);
  const years = normalizeText(query).match(/\b(19|20)\d{2}\b/g) || [];
  const hasAllYears = years.length > 0 && years.every(year => normalized.includes(year));

  let score = 0;
  if (hasScorePattern) score += 1.5;
  if (hasVsPattern) score += 0.5;
  if (hasResultWord) score += 0.5;
  if (hasAllYears) score += 1;

  return score;
}

function isLikelyExactMatch(query: string, title: string | undefined, content: string | undefined): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return false;

  const haystack = `${title || ''} ${content || ''}`;
  const normalized = normalizeText(haystack);
  const tokenHits = tokens.filter(token => normalized.includes(token)).length;
  const tokenCoverage = tokenHits / tokens.length;
  const cueScore = getAnswerCueScore(query, haystack);

  return tokenCoverage >= 0.6 && cueScore >= 1;
}

function suggestRefinedQuery(query: string): string {
  const normalized = normalizeText(query);
  if (/(vs|versus|match|game)/.test(normalized) && !/\b(result|score)\b/.test(normalized)) {
    return `${query} result score`;
  }
  if (!/\b(official|verified)\b/.test(normalized)) {
    return `${query} official`;
  }
  return query;
}

export async function crawlSpecificUrls(args: CrawlSpecificUrlsArgs): Promise<any> {
    // keeping crawl implementations same
  const inputUrls: string[] = [];

  if (args && typeof args.url === 'string') {
    inputUrls.push(args.url);
  }

  if (args && Array.isArray(args.urls)) {
    inputUrls.push(...args.urls.filter(url => typeof url === 'string'));
  }

  const uniqueUrls = Array.from(new Set(inputUrls.map(url => url.trim()).filter(Boolean)));

  if (uniqueUrls.length === 0) {
    return { text: 'Please provide a URL to crawl.', sources: [] };
  }

  // @ts-ignore - crawlUrl type issue
  const crawlPromises = uniqueUrls.map(url => crawlUrl(url));
  const crawlResults = await Promise.all(crawlPromises);
  const validResults = crawlResults.filter((r: any) => r !== null && r.content && r.content.length > 50);

  if (validResults.length === 0) {
    return { text: 'Unable to extract readable content from the provided URL(s).', sources: [] };
  }

  const formattedResults = validResults
    .map((result: any, idx: number) => `### Source ${idx + 1}: ${result.title}\n**URL:** ${result.url}\n**Content:** ${result.content}`)
    .join('\n\n---\n\n');

  return {
    text: `## URL Crawl Results\n\n${formattedResults}`,
    sources: validResults.map((result: any) => ({ title: result.title, url: result.url })),
    results: validResults
  };
}

export async function webSearch(query: string): Promise<any> {
    // simplified for brevity as logic is same
  try {
    console.log(`[Web Search] Starting search for: "${query}"`);
    
    if (!query || query.trim().length === 0) {
      return { text: 'Please provide a search query.', sources: [] };
    }

    // @ts-ignore
    const urls: string[] = await searchWebUrls(query);

    if (urls.length === 0) {
      return {
        text: `I couldn't find any search results for "${query}". Please try a different query.`,
        sources: []
      };
    }

    const maxCrawl = Math.min(urls.length, 15);
    // @ts-ignore
    const crawlPromises = urls.slice(0, maxCrawl).map(url => crawlUrl(url));
    const crawlResults: any[] = await Promise.all(crawlPromises);
    
    const validResults = crawlResults.filter(r => r !== null && r.content && r.content.length > 50);

    if (validResults.length === 0) {
      return {
        text: `Found search results but couldn't extract content from any pages. Try a different query.`,
        sources: []
      };
    }

    const exactMatches = validResults.filter(result =>
      isLikelyExactMatch(query, result.title, result.content)
    );
    const exactMatchFound = exactMatches.length > 0;

    const formattedResults = validResults
      .map((result, idx) => {
        const exactTag = isLikelyExactMatch(query, result.title, result.content) ? ' (exact match)' : '';
        return `### Source ${idx + 1}: ${result.title}${exactTag}\n**URL:** ${result.url}\n**Content:** ${result.content}`;
      })
      .join('\n\n---\n\n');

    return {
      text: `## Web Search Results for "${query}"\n\n${formattedResults}`,
      sources: validResults.map((result) => ({
        title: result.title,
        url: result.url
      })),
      exactMatchFound,
      exactMatches: exactMatches.map(result => ({ title: result.title, url: result.url })),
      needsMoreSearch: !exactMatchFound,
      suggestedQuery: exactMatchFound ? null : suggestRefinedQuery(query)
    };
  } catch (error: any) {
    console.error(`[Web Search] Error: ${error.message}`);
    return {
      text: `Web search encountered an error: ${error.message}. Please try again.`,
      sources: []
    };
  }
}

export async function webSearchStreaming(query: string, onSource?: (source: any) => void): Promise<any> {
    // same implementation mostly
  try {
    console.log(`[Web Search Streaming] Starting search for: "${query}"`);
    
    if (!query || query.trim().length === 0) {
      return { text: 'Please provide a search query.', sources: [] };
    }

    // @ts-ignore
    const urls: string[] = await searchWebUrls(query);

    if (urls.length === 0) {
      return {
        text: `I couldn't find any search results for "${query}". Please try a different query.`,
        sources: []
      };
    }

    const maxCrawl = Math.min(urls.length, 15);
    const validResults: any[] = [];
    const exactMatches: any[] = [];
    // @ts-ignore
    const crawlPromises = urls.slice(0, maxCrawl).map(async (url: string, index: number) => {
      try {
        // @ts-ignore
        const result: any = await crawlUrl(url);
        if (result && result.content && result.content.length > 50) {
          const source = {
            title: result.title,
            url: result.url
          };
          validResults.push(source);
          if (isLikelyExactMatch(query, result.title, result.content)) {
            exactMatches.push(source);
          }
          if (onSource) {
            onSource(source);
          }
          return result;
        }
      } catch (e: any) {
        console.error(`[Web Search Streaming] Error crawling ${url}:`, e.message);
      }
      return null;
    });

    await Promise.all(crawlPromises);

    if (validResults.length === 0) {
      return {
        text: `Found search results but couldn't extract content from any pages. Try a different query.`,
        sources: []
      };
    }

    const exactMatchFound = exactMatches.length > 0;
    const formattedResults = validResults
      .map((source, idx) => `### Source ${idx + 1}: ${source.title}\n**URL:** ${source.url}`)
      .join('\n\n---\n\n');

    return {
      text: `## Web Search Results for "${query}"\n\n${formattedResults}`,
      sources: validResults,
      exactMatchFound,
      exactMatches,
      needsMoreSearch: !exactMatchFound,
      suggestedQuery: exactMatchFound ? null : suggestRefinedQuery(query)
    };
  } catch (error: any) {
    console.error(`[Web Search Streaming] Error: ${error.message}`);
    return {
      text: `Web search encountered an error: ${error.message}. Please try again.`,
      sources: []
    };
  }
}

export async function getStreamLink(args: GetStreamLinkArgs): Promise<any> {
    if (!args.imdb_id) {
         if (!args.title) return { success: false, message: 'Must provide imdb_id or precise title.' };
         const search = await searchIMDB(args.title, 1);
         if (search && search.length > 0) {
             args.imdb_id = search[0].id;
             if (!args.year) args.year = search[0].year;
         } else {
             return { success: false, message: 'Could not resolve title to IMDb ID.' };
         }
    }

    try {
        const result = await getStreamForTitle({
            imdbId: args.imdb_id!,
            title: args.title || 'Unknown',
            year: args.year,
            type: args.season ? 'tv' : 'movie',
            season: args.season || 1,
            episode: args.episode || 1
        });

        if (result && result.streamUrl) {
            return {
                type: 'stream_card',
                imdb_id: args.imdb_id,
                title: args.title,
                season: args.season || 1,
                episode: args.episode || 1,
                media_type: args.season ? 'tv' : 'movie'
            };
        } else {
            return { success: false, message: 'Stream not found for this title.' };
        }
    } catch (e) {
        console.error('getStreamLink tool error:', e);
        return { success: false, message: 'Internal error resolving stream.' };
    }
}

type ToolExecutor = (args: any, userId: string | null, options?: any) => Promise<any>;

export async function executeTool(toolName: string, args: any, userId: string | null = null, options: any = {}): Promise<any> {
    // Tool selection map remains mainly the same
  const tools: Record<string, ToolExecutor> = {
    'get_stream_link': (a) => getStreamLink(a as GetStreamLinkArgs),
    'web_search': (a) => webSearch((a as WebSearchArgs).query),
    'urls_crawiling_tool': (a) => crawlSpecificUrls(a as CrawlSpecificUrlsArgs),
    'search_imdb': (a) => searchIMDB((a as SearchIMDBArgs).query, (a as SearchIMDBArgs).limit),
    'batch_search_media': (a) => batchSearchMedia((a as BatchSearchMediaArgs).queries),
    'get_title_details': (a) => getTitleDetails((a as GetTitleDetailsArgs).imdb_id),
    'get_user_lists': async (_, uid) => uid ? await getUserLists(uid) : [],
    'get_user_ratings': async (_, uid) => uid ? await getUserRatings(uid) : [],
    'get_title_watch_status': async (a, uid) => uid ? await getTitleWatchStatus(uid, (a as TitleWatchStatusArgs).title_id) : null,
    'search_user_lists': async (a, uid) => uid ? await searchUserLists(uid, (a as SearchUserListsArgs).query) : [],
    'add_to_list': async (a, uid) => uid
      ? await addToList(uid, (a as AddToListArgs).list_name, (a as AddToListArgs).title_id, { createIfMissing: true })
      : { success: false, message: 'User not authenticated' },
    'bulk_add_to_list': async (a, uid, opts) => uid
      ? await bulkAddToList(uid, (a as BulkAddToListArgs).list_name, (a as BulkAddToListArgs).title_ids, opts)
      : { success: false, message: 'User not authenticated' },
    'remove_from_list': async (a, uid) => uid
      ? await removeFromList(uid, (a as RemoveFromListArgs).list_name, (a as RemoveFromListArgs).title_id)
      : { success: false, message: 'User not authenticated' },
    'bulk_remove_from_list': async (a, uid) => uid
      ? await bulkRemoveFromList(uid, (a as BulkRemoveFromListArgs).list_name, (a as BulkRemoveFromListArgs).title_ids)
      : { success: false, message: 'User not authenticated' },
    'clear_list': async (a, uid) => uid
      ? await clearList(uid, (a as ClearListArgs).list_name)
      : { success: false, message: 'User not authenticated' },
    'delete_list': async (a, uid) => uid
      ? await deleteList(uid, (a as DeleteListArgs).list_name)
      : { success: false, message: 'User not authenticated' },
    'move_between_lists': async (a, uid) => uid
      ? await moveBetweenLists(uid, (a as MoveBetweenListsArgs).from_list, (a as MoveBetweenListsArgs).to_list, (a as MoveBetweenListsArgs).title_id, { createToList: true })
      : { success: false, message: 'User not authenticated' },
    'get_watch_status_batch': async (a, uid) => uid
      ? await getWatchStatusBatch(uid, (a as WatchStatusBatchArgs).title_ids)
      : [],
    'rate_title': async (a, uid) => uid
      ? await rateTitle(uid, (a as RateTitleArgs).title_id, (a as RateTitleArgs).score, (a as RateTitleArgs).review)
      : { success: false, message: 'User not authenticated' },
  };

  const executor = tools[toolName];
  if (executor) {
    return await executor(args, userId, options);
  }

  return { error: `Unknown tool: ${toolName}` };
}
