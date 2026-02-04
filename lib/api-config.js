// Shared API configuration for server-side routes
export const API_BASE = process.env.IMDB_API_BASE || 'https://api.imdbapi.dev';

// Cache durations in seconds
export const CACHE_DURATIONS = {
  // Title details - cache for 1 hour, revalidate for 24 hours
  TITLE_DETAILS: 'public, max-age=3600, stale-while-revalidate=86400',
  // Search results - cache for 5 minutes
  SEARCH: 'public, max-age=300, stale-while-revalidate=600',
  // Trending/Top lists - cache for 10 minutes
  LISTS: 'public, max-age=600, stale-while-revalidate=3600',
  // Credits, images, videos - cache for 6 hours
  MEDIA: 'public, max-age=21600, stale-while-revalidate=86400',
  // Awards and box office - cache for 24 hours (rarely changes)
  STATIC: 'public, max-age=86400, stale-while-revalidate=604800',
};

// Timeout settings (in milliseconds)
export const TIMEOUTS = {
  DEFAULT: 30000, // 30 seconds
  QUICK: 15000,   // 15 seconds for fast operations
  LONG: 45000,    // 45 seconds for heavy operations
};

// Dark gray blur placeholder for dark theme (rgb(24, 24, 27) - zinc-900)
export const BLUR_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNiYGBgAAAABgABijfCEgAAAABJRU5ErkJggg==';

// Retry utility with exponential backoff
export async function retryWithBackoff(fn, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      const isLastRetry = i === maxRetries - 1;

      if (isLastRetry || !isTimeout) {
        throw error;
      }

      // Wait with exponential backoff: 1s, 2s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}

// Create headers with cache control
export function createCachedResponse(data, cacheDuration) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheDuration,
    },
  });
}
