import { NextResponse } from 'next/server';
import axios from 'axios';

const API_BASE = 'https://api.imdbapi.dev';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season');
  const initialPageToken = searchParams.get('pageToken');

  if (!season) {
    return NextResponse.json({ error: 'Season parameter required' }, { status: 400 });
  }

  try {
    let allEpisodes = [];
    let currentPageToken = initialPageToken || null;
    let fetchMore = true;
    let loops = 0;
    const MAX_LOOPS = 50; // Fetch up to ~1000 episodes per request to avoid timeouts

    while (fetchMore && loops < MAX_LOOPS) {
      const params = { season };
      if (currentPageToken) params.pageToken = currentPageToken;

      try {
        const response = await axios.get(`${API_BASE}/titles/${id}/episodes`, { params });
        const data = response.data;

        if (data.episodes && Array.isArray(data.episodes)) {
          allEpisodes = [...allEpisodes, ...data.episodes];
        }

        if (data.nextPageToken) {
          currentPageToken = data.nextPageToken;
          loops++;
        } else {
          currentPageToken = null; // No more pages
          fetchMore = false;
        }
      } catch (innerError) {
        console.error('Partial fetch error:', innerError.message);
        // Stop fetching but return what we have
        fetchMore = false;
      }
    }

    return NextResponse.json({ 
      episodes: allEpisodes, 
      nextPageToken: currentPageToken 
    });
  } catch (error) {
    console.error('Episode Fetch Error:', error.message);
    return NextResponse.json({ error: 'External API Error' }, { status: 500 });
  }
}
