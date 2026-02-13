/**
 * Torrent Cleanup Utilities
 * 
 * Shared utilities for managing torrent streaming lifecycle and cleanup.
 * Used by both WatchPage and NetflixStylePlayer components.
 */

const recentCleanup = new Map<string, number>();
const CLEANUP_DEDUPE_MS = 1000;

/**
 * Extract infoHash from various URL formats
 * 
 * @param url - URL containing a torrent infoHash
 * @returns 40-character hex infoHash or null if not found
 */
export function extractInfoHash(url: string | null): string | null {
  if (!url) return null;
  
  // Format 1: /api/stream/magnet/[hash]
  const apiMatch = url.match(/\/api\/stream\/magnet\/([a-fA-F0-9]{40})/);
  if (apiMatch) return apiMatch[1];
  
  // Format 2: magnet:?xt=urn:btih:[hash]
  const magnetMatch = url.match(/magnet:\?xt=urn:btih:([a-fA-F0-9]{40})/i);
  if (magnetMatch) return magnetMatch[1];
  
  return null;
}

/**
 * Cleanup server-side torrent - called before navigation or on unmount
 * 
 * Uses fetch() with keepalive for SPA navigation (more reliable)
 * Falls back to sendBeacon() for page unload events
 * 
 * @param url - Current streamUrl to extract infoHash from
 * @returns Promise that resolves when cleanup is initiated
 */
export async function cleanupTorrent(url: string | null): Promise<void> {
  const infoHash = extractInfoHash(url);
  if (!infoHash) return;

  const now = Date.now();
  const previous = recentCleanup.get(infoHash);
  if (previous && now - previous < CLEANUP_DEDUPE_MS) {
    return;
  }
  recentCleanup.set(infoHash, now);
  
  console.log('[Cleanup] Destroying torrent:', infoHash.substring(0, 8) + '...');
  
  try {
    // Use fetch for SPA navigation (more reliable than sendBeacon for cleanup)
    await fetch('/api/stream/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ infoHash }),
      keepalive: true // Ensures request completes even if page unloads
    });
  } catch (e) {
    recentCleanup.delete(infoHash);
    // Fallback to sendBeacon for page unload
    // Use Blob with proper MIME type for correct Content-Type handling
    try {
      const blob = new Blob([JSON.stringify({ infoHash })], {
        type: 'application/json'
      });
      navigator.sendBeacon('/api/stream/cleanup', blob);
    } catch {
      fetch(`/api/stream/cleanup?infoHash=${infoHash}`, {
        method: 'GET',
        keepalive: true
      }).catch(() => {});
    }
  }
}

/**
 * Cleanup handler for page unload events
 * 
 * @param streamUrl - Current streamUrl to cleanup
 */
export function handleBeforeUnload(streamUrl: string | null): void {
  const infoHash = extractInfoHash(streamUrl);
  if (!infoHash) return;

  const now = Date.now();
  const previous = recentCleanup.get(infoHash);
  if (previous && now - previous < CLEANUP_DEDUPE_MS) {
    return;
  }
  recentCleanup.set(infoHash, now);
  
  // Use sendBeacon with Blob for proper Content-Type (most reliable in this context)
  try {
    const blob = new Blob([JSON.stringify({ infoHash })], {
      type: 'application/json'
    });
    navigator.sendBeacon('/api/stream/cleanup', blob);
  } catch {
    fetch(`/api/stream/cleanup?infoHash=${infoHash}`, {
      method: 'GET',
      keepalive: true
    }).catch(() => {});
  }
}
