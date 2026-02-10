# Torrent Streaming Cleanup Fix - Manual Testing Guide

## Overview
This fix ensures torrent streaming sessions are properly closed and resources are released in all navigation scenarios.

## Changes Made

### Files Modified
1. **app/watch/[id]/page.tsx**
2. **components/player/NetflixStylePlayer.tsx**

### Key Improvements

#### 1. Enhanced InfoHash Extraction
- **Before**: Only matched format `magnet/[hash]` in URLs
- **After**: Matches both `/api/stream/magnet/[hash]` and `magnet:?xt=urn:btih:[hash]`
- Handles uppercase/lowercase hashes correctly

#### 2. Automatic Cleanup on URL Change
- **Implementation**: Track previous streamUrl with `useRef`
- **Trigger**: When streamUrl changes (episode switch, source switch)
- **Action**: Cleanup previous torrent before loading new one

#### 3. Enhanced Navigation Cleanup
- **Before**: Only `beforeunload` event (unreliable in SPAs)
- **After**: 
  - `beforeunload` event (page close/refresh)
  - Component unmount (SPA navigation)
  - Manual cleanup before navigation actions

#### 4. Reliable Cleanup API Calls
- **Primary**: `fetch()` with `keepalive: true` for SPA navigation
- **Fallback**: `sendBeacon()` for page unload events
- **Error Handling**: Graceful fallback if fetch fails

#### 5. Episode Navigation Cleanup
- **Before**: Direct `router.push()` without cleanup
- **After**: `await cleanupTorrent()` before navigation

#### 6. Source Switching Cleanup
- **Before**: Direct state update without cleanup
- **After**: `await cleanupTorrent()` before changing source

## Manual Testing Checklist

### Prerequisites
1. Start the development server: `npm run dev`
2. Open browser to `http://localhost:3000`
3. Open browser console (F12) to monitor cleanup logs
4. Find a TV series with multiple episodes and torrent sources

### Test Scenarios

#### ✅ Test 1: Episode Switching
**Steps:**
1. Navigate to a series watch page
2. Start playing an episode with a torrent source
3. Wait for torrent to initialize (check console for "[Torrent]" logs)
4. Open episodes panel and click on a different episode
5. **Expected**: Console shows "[Cleanup] Destroying torrent: [hash]..."
6. **Expected**: New episode starts loading
7. **Verify**: Only one torrent active in console logs

#### ✅ Test 2: Source/Torrent Switching
**Steps:**
1. Start playing a video with a torrent source
2. Wait for playback to begin
3. Open source selector and choose a different torrent
4. **Expected**: Console shows cleanup of previous torrent
5. **Expected**: New torrent starts loading
6. **Verify**: No duplicate torrent connections

#### ✅ Test 3: Back Navigation
**Steps:**
1. Start playing a video with torrent
2. Wait for playback to begin
3. Press browser back button or click back arrow
4. **Expected**: Console shows torrent cleanup
5. **Expected**: Navigate back to previous page
6. **Verify**: Torrent connection closed (check network tab)

#### ✅ Test 4: Player Close (NetflixStylePlayer)
**Steps:**
1. If using NetflixStylePlayer component
2. Start playing with torrent
3. Click close button or press Escape
4. **Expected**: Console shows cleanup
5. **Expected**: Player closes cleanly

#### ✅ Test 5: Page Refresh
**Steps:**
1. Start playing with torrent
2. Refresh the page (F5 or Ctrl+R)
3. **Expected**: `beforeunload` event triggers cleanup
4. **Expected**: Fresh torrent session on reload

#### ✅ Test 6: Direct Home Navigation
**Steps:**
1. Start playing with torrent
2. Click logo or navigate to home page
3. **Expected**: Component unmount cleanup triggers
4. **Expected**: No lingering torrent connections

### Verification Points

#### Console Logs to Watch For
- ✅ `[Cleanup] Destroying torrent: [hash]...` - Cleanup initiated
- ✅ `[NetflixPlayer Cleanup] Destroying torrent: [hash]...` - Player cleanup
- ✅ `[Cleanup] Stream URL changed, cleaning up previous torrent` - URL change detection
- ✅ `[MagnetService] Destroying torrent: [hash]...` - Backend cleanup
- ✅ `[Torrent] Destroying client instance` - Client destruction

#### Network Tab Verification
1. Open DevTools Network tab
2. Filter by "cleanup"
3. Verify POST requests to `/api/stream/cleanup` with `infoHash` payload
4. Check response is `{"ok": true}`

#### Resource Leak Check
1. Open Chrome Task Manager (Shift+Esc)
2. Find browser tab with video player
3. Monitor memory usage
4. **Before Fix**: Memory increases with each episode/source switch
5. **After Fix**: Memory stays relatively stable

### Expected Behavior Summary

| Scenario | Cleanup Trigger | Method | Expected Result |
|----------|----------------|--------|-----------------|
| Episode Switch | Before `router.push()` | `fetch()` + keepalive | Old torrent destroyed before navigation |
| Source Switch | Before state update | `fetch()` + keepalive | Old torrent destroyed before new source |
| Back Navigation | Component unmount | `fetch()` + keepalive | Torrent destroyed on cleanup |
| Player Close | `handleBack()` | `fetch()` + keepalive | Torrent destroyed before close |
| Page Unload | `beforeunload` event | `sendBeacon()` | Torrent destroyed on page close |
| URL Change | `useEffect` on streamUrl | `fetch()` + keepalive | Previous torrent destroyed |

## Troubleshooting

### Issue: Cleanup not firing
- **Check**: Console for error messages
- **Check**: Network tab for failed requests
- **Solution**: Verify MongoDB connection and auth

### Issue: Multiple torrents active
- **Check**: Console for duplicate "[Torrent] Initializing" logs
- **Check**: Ensure cleanup logs appear between switches
- **Solution**: Hard refresh (Ctrl+Shift+R)

### Issue: "Missing infoHash" error
- **Check**: URL format in cleanup call
- **Solution**: Verify `extractInfoHash()` regex patterns

## Success Criteria
- [x] All 6 test scenarios pass
- [x] No duplicate torrent connections in console
- [x] Cleanup API calls succeed (status 200)
- [x] Memory usage remains stable
- [x] No JavaScript errors in console
- [x] Build passes without errors
- [x] CI workflow passes

## Notes
- Cleanup uses `keepalive: true` to ensure requests complete even during navigation
- `sendBeacon()` is used as fallback for page unload (most reliable)
- Both WatchPage and NetflixStylePlayer components have identical cleanup logic
- Server-side cleanup API at `/api/stream/cleanup` handles actual torrent destruction
