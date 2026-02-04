import { NextResponse } from 'next/server';
import axios from 'axios';
import { API_BASE, CACHE_DURATIONS, TIMEOUTS, retryWithBackoff } from '@/lib/api-config';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`${API_BASE}/search/titles`, {
        params: { query },
        timeout: TIMEOUTS.QUICK
      })
    );

    return NextResponse.json(response.data, {
      headers: {
        'Cache-Control': CACHE_DURATIONS.SEARCH,
      },
    });
  } catch (error) {
    console.error('Error searching titles:', error.message);
    return NextResponse.json(
      { error: 'External API Error', details: error.message },
      { status: 500 }
    );
  }
}
