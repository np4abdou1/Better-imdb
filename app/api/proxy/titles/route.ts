import { NextResponse } from 'next/server';
import axios from 'axios';
import { API_BASE, CACHE_DURATIONS, TIMEOUTS, retryWithBackoff } from '@/lib/api-config';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  // Handle array parameters properly (types, genres, countryCodes, etc.)
  const params: Record<string, any> = {};
  for (const [key, value] of searchParams.entries()) {
    if (params[key]) {
      // If key already exists, convert to array
      if (Array.isArray(params[key])) {
        params[key].push(value);
      } else {
        params[key] = [params[key], value];
      }
    } else {
      params[key] = value;
    }
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`${API_BASE}/titles`, {
        params,
        paramsSerializer: {
          indexes: null // Use repeat format: types=MOVIE&types=TV_SERIES
        },
        timeout: TIMEOUTS.DEFAULT
      })
    );

    // Filter results for quality: require posters and restrict to main title types
    const titleType = params.titleType ? params.titleType.split(',').map(t => t.trim()) : null;
    const filtered = (response.data.titles || []).filter(title => {
      // Must have a poster
      if (!title.primaryImage?.url) return false;
      
      // If titleType filter is specified, enforce it
      if (titleType && !titleType.includes(title.type)) return false;
      
      return true;
    });

    return NextResponse.json({ ...response.data, titles: filtered }, {
      headers: {
        'Cache-Control': CACHE_DURATIONS.LISTS,
      },
    });
  } catch (error) {
    console.error('Error fetching titles:', error.message);
    return NextResponse.json(
      { error: 'External API Error', details: error.message },
      { status: 500 }
    );
  }
}
