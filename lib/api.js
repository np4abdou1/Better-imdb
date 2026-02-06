import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes default TTL

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, { data, expires: Date.now() + ttl });
  // Cleanup old entries periodically (keep cache under 100 entries)
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expires) cache.delete(k);
    }
  }
}

// Request deduplication - prevent duplicate concurrent requests
const pendingRequests = new Map();

async function dedupedRequest(key, requestFn) {
  // Check cache first
  const cached = getCached(key);
  if (cached) return cached;

  // Check if request is already in flight
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  // Create new request
  const promise = requestFn()
    .then(result => {
      setCache(key, result);
      pendingRequests.delete(key);
      return result;
    })
    .catch(err => {
      pendingRequests.delete(key);
      throw err;
    });

  pendingRequests.set(key, promise);
  return promise;
}

// Store for active abort controllers
const abortControllers = new Map();

export function createAbortController(key) {
  // Cancel any existing request with this key
  cancelRequest(key);
  const controller = new AbortController();
  abortControllers.set(key, controller);
  return controller;
}

export function cancelRequest(key) {
  const controller = abortControllers.get(key);
  if (controller) {
    controller.abort();
    abortControllers.delete(key);
  }
}

export function cancelAllRequests() {
  for (const controller of abortControllers.values()) {
    controller.abort();
  }
  abortControllers.clear();
}

export const searchTitles = async (query, signal) => {
  const config = signal ? { params: { query }, signal } : { params: { query } };
  const { data } = await api.get('/proxy/search', config);
  return data;
};

export const getTitleDetails = async (id) => {
  const cacheKey = `title:${id}`;
  return dedupedRequest(cacheKey, async () => {
    const { data } = await api.get(`/proxy/titles/${id}`);
    return data;
  });
};

export const getTitleEpisodes = async (id, season, pageToken = null) => {
  const params = { season };
  if (pageToken) params.pageToken = pageToken;
  const { data } = await api.get(`/proxy/titles/${id}/episodes`, { params });
  return data;
};

export const getLists = async () => {
  const cacheKey = 'lists:all';
  return dedupedRequest(cacheKey, async () => {
    const { data } = await api.get('/lists');
    return data;
  });
};

export const getRating = async (id) => {
  try {
    const { data } = await api.get(`/ratings/${id}`);
    return data;
  } catch (error) {
    if (error.response?.status === 500 || error.response?.status === 404) {
      console.warn('Rating not found or database error:', error.message);
      return null;
    }
    throw error;
  }
};

export const getAllRatings = async () => {
  try {
    const { data } = await api.get('/ratings');
    return data.ratings || [];
  } catch (error) {
    console.warn('Failed to fetch all ratings:', error.message);
    return [];
  }
};

export const saveRating = async (id, score, review) => {
  try {
    // Invalidate cache when saving
    cache.delete(`title:${id}`);
    const { data } = await api.post('/ratings', { title_id: id, score, review });
    return data;
  } catch (error) {
    console.error('Error saving rating:', error);
    throw error;
  }
};

export const addListItem = async (listId, titleId) => {
  try {
    // Invalidate lists cache when modifying
    cache.delete('lists:all');
    const { data } = await api.post(`/lists/${listId}/items`, { title_id: titleId });
    return { ...data, status: 'added', alreadyExists: false };
  } catch (error) {
    console.error('Error adding item to list:', error);
    if (error.response?.status === 409) {
      // Item already exists - return success but indicate it was already there
      return { message: 'Item already in list', status: 'exists', alreadyExists: true };
    }
    throw error;
  }
};

export const getTitleCredits = async (id, pageToken = null) => {
  try {
    const cacheKey = `credits:${id}:${pageToken || 'initial'}`;
    return dedupedRequest(cacheKey, async () => {
      const params = {};
      if (pageToken) params.pageToken = pageToken;
      const { data } = await api.get(`/proxy/titles/${id}/credits`, { params });
      return data;
    });
  } catch (error) {
    console.error('Error fetching credits:', error);
    return { credits: [], totalCount: 0 };
  }
};

export const getTitleImages = async (id, pageToken = null) => {
  try {
    const cacheKey = `images:${id}:${pageToken || 'initial'}`;
    return dedupedRequest(cacheKey, async () => {
      const params = {};
      if (pageToken) params.pageToken = pageToken;
      const { data } = await api.get(`/proxy/titles/${id}/images`, { params });
      return data;
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    return { images: [], totalCount: 0 };
  }
};

export const getTitleVideos = async (id, pageToken = null) => {
  try {
    const params = {};
    if (pageToken) params.pageToken = pageToken;
    const { data } = await api.get(`/proxy/titles/${id}/videos`, { params });
    return data;
  } catch (error) {
    console.error('Error fetching videos:', error);
    return { videos: [], totalCount: 0 };
  }
};

export const getTitleAwards = async (id) => {
  try {
    const cacheKey = `awards:${id}`;
    return dedupedRequest(cacheKey, async () => {
      const { data } = await api.get(`/proxy/titles/${id}/awardNominations`);
      return data;
    });
  } catch (error) {
    console.warn('Error fetching awards:', error);
    return { awardNominations: [] };
  }
};

export const getTitleBoxOffice = async (id) => {
  try {
    const cacheKey = `boxoffice:${id}`;
    return dedupedRequest(cacheKey, async () => {
      const { data } = await api.get(`/proxy/titles/${id}/boxOffice`);
      return data;
    });
  } catch (error) {
    console.warn('Error fetching box office:', error);
    return null;
  }
};

export const getTrendingTitles = async () => {
  try {
    const cacheKey = 'trending:titles';
    return dedupedRequest(cacheKey, async () => {
      const { data } = await api.get('/proxy/titles', {
        params: {
          sortBy: 'SORT_BY_POPULARITY',
          sortOrder: 'DESC',
          minVoteCount: 500,
          titleType: 'movie,tvSeries,tvMiniSeries'
        }
      });
      return data;
    });
  } catch (error) {
    console.error('Error fetching trending:', error);
    return { titles: [], totalCount: 0 };
  }
};

export const getTopRatedTitles = async () => {
  try {
    const cacheKey = 'toprated:titles';
    return dedupedRequest(cacheKey, async () => {
      const { data } = await api.get('/proxy/titles', {
        params: {
          sortBy: 'SORT_BY_USER_RATING',
          minVoteCount: 25000,
          sortOrder: 'DESC',
          titleType: 'movie,tvSeries,tvMiniSeries'
        }
      });
      return data;
    });
  } catch (error) {
    console.error('Error fetching top rated:', error);
    return { titles: [], totalCount: 0 };
  }
};

export const getTopRatedAnime = async () => {
  try {
    const cacheKey = 'toprated:anime';
    return dedupedRequest(cacheKey, async () => {
      const allTitles = [];
      let pageToken = null;
      const maxPages = 10;
      const maxResults = 200;

      for (let i = 0; i < maxPages; i += 1) {
        const { data } = await api.get('/proxy/titles', {
          params: {
            sortBy: 'SORT_BY_USER_RATING',
            sortOrder: 'DESC',
            genres: 'Animation',
            countryCodes: 'JP',
            types: 'TV_SERIES',
            pageToken: pageToken || undefined
          }
        });

        allTitles.push(...(data.titles || []));
        pageToken = data.nextPageToken;

        if (!pageToken || allTitles.length >= maxResults) break;
      }

      const dedupedTitles = Array.from(
        new Map(allTitles.map(title => [title.id, title])).values()
      ).slice(0, maxResults);

      return {
        titles: dedupedTitles,
        totalCount: dedupedTitles.length
      };
    });
  } catch (error) {
    console.error('Error fetching top rated anime:', error);
    return { titles: [], totalCount: 0 };
  }
};

export const getStarMeter = async () => {
  try {
    const cacheKey = 'starmeter:names';
    return dedupedRequest(cacheKey, async () => {
      const { data } = await api.get('/proxy/chart/starmeter');
      return data;
    });
  } catch (error) {
    console.error('Error fetching star meter:', error);
    return { names: [] };
  }
};

export const getPeople = async () => {
  return getStarMeter();
};

// Advanced filtering for titles
export const getFilteredTitles = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    
    params.append('sortBy', filters.sortBy || 'SORT_BY_USER_RATING');
    params.append('sortOrder', filters.sortOrder || 'DESC');
    params.append('minVoteCount', filters.minVoteCount || 1000);

    // Add array parameters using repeat format
    if (filters.types?.length) {
      filters.types.forEach(type => params.append('types', type));
    }
    if (filters.genres?.length) {
      filters.genres.forEach(genre => params.append('genres', genre));
    }
    if (filters.countryCodes?.length) {
      filters.countryCodes.forEach(code => params.append('countryCodes', code));
    }
    
    if (filters.startYear) params.append('startYear', filters.startYear);
    if (filters.endYear) params.append('endYear', filters.endYear);
    if (filters.minRating) params.append('minAggregateRating', filters.minRating);
    if (filters.maxRating) params.append('maxAggregateRating', filters.maxRating);
    if (filters.pageToken) params.append('pageToken', filters.pageToken);
    
    // Note: limit is not supported by the external API for filtered titles, 
    // relying on default page size.

    const { data } = await api.get(`/proxy/titles?${params.toString()}`);
    return data;
  } catch (error) {
    console.error('Error fetching filtered titles:', error);
    return { titles: [], totalCount: 0 };
  }
};

export const getTitleLogo = async (id) => {
  try {
    const cacheKey = `logo:v7:${id}`; // v7: Optimized for widest + most voted logos
    return dedupedRequest(cacheKey, async () => {
      const { data } = await api.get(`/proxy/titles/${id}/logo`, {
        params: { v: '7' }
      });
      return data;
    });
  } catch (error) {
    console.warn('Error fetching logo:', error);
    return { logos: [], bestLogo: null };
  }
};

export const getTitleSeasons = async (id) => {
  try {
    const cacheKey = `seasons:${id}`;
    return dedupedRequest(cacheKey, async () => {
      const { data } = await api.get(`/proxy/titles/${id}/seasons`);
      return data;
    });
  } catch (error) {
    console.warn('Error fetching seasons:', error);
    return { seasons: [] };
  }
};

// Batch fetch multiple title details at once
export const getBatchTitleDetails = async (ids) => {
  const results = await Promise.allSettled(
    ids.map(id => getTitleDetails(id))
  );
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    console.warn(`Failed to fetch title ${ids[index]}:`, result.reason);
    return null;
  }).filter(Boolean);
};

export default api;
