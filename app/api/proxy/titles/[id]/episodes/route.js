import { NextResponse } from 'next/server';
import axios from 'axios';
import { API_BASE, CACHE_DURATIONS, TIMEOUTS, retryWithBackoff } from '@/lib/api-config';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season');
  const pageToken = searchParams.get('pageToken');
  const fetchAll = searchParams.get('fetchAll') === 'true';

  if (!season) {
    return NextResponse.json({ error: 'Season parameter required' }, { status: 400 });
  }

  try {
    // If fetchAll is requested, batch fetch with a reasonable limit
    if (fetchAll) {
      let allEpisodes = [];
      let currentPageToken = pageToken || null;
      let loopCount = 0;
      const MAX_LOOPS = 10; // Limit to 10 pages max (~200 episodes) to prevent timeouts

      while (loopCount < MAX_LOOPS) {
        const queryParams = { season };
        if (currentPageToken) queryParams.pageToken = currentPageToken;

        const response = await retryWithBackoff(() => 
          axios.get(`${API_BASE}/titles/${id}/episodes`, {
            params: queryParams,
            timeout: TIMEOUTS.QUICK
          })
        );

        const data = response.data;
        if (data.episodes && Array.isArray(data.episodes)) {
          allEpisodes = [...allEpisodes, ...data.episodes];
        }

        if (data.nextPageToken) {
          currentPageToken = data.nextPageToken;
          loopCount++;
        } else {
          break;
        }
      }

      return NextResponse.json({
        episodes: allEpisodes,
        nextPageToken: currentPageToken, // Return remaining token if any
        hasMore: loopCount >= MAX_LOOPS
      }, {
        headers: {
          'Cache-Control': CACHE_DURATIONS.MEDIA,
        },
      });
    }

    // Standard single-page fetch (default behavior)
    const queryParams = { season };
    if (pageToken) queryParams.pageToken = pageToken;

    const response = await retryWithBackoff(() =>
      axios.get(`${API_BASE}/titles/${id}/episodes`, {
        params: queryParams,
        timeout: TIMEOUTS.DEFAULT
      })
    );

    return NextResponse.json(response.data, {
      headers: {
        'Cache-Control': CACHE_DURATIONS.MEDIA,
      },
    });
  } catch (error) {
    console.error('Episode Fetch Error:', error.message);
    return NextResponse.json({ error: 'External API Error', episodes: [] }, { status: 500 });
  }
}
