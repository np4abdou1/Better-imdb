import { NextResponse } from 'next/server';
import axios from 'axios';
import { API_BASE, CACHE_DURATIONS, TIMEOUTS, retryWithBackoff } from '@/lib/api-config';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const params = Object.fromEntries(searchParams.entries());

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`${API_BASE}/chart/starmeter`, {
        params,
        timeout: TIMEOUTS.DEFAULT
      })
    );

    return NextResponse.json(response.data, {
      headers: {
        'Cache-Control': CACHE_DURATIONS.LISTS,
      },
    });
  } catch (error) {
    console.error('Error fetching star meter:', error.message);
    return NextResponse.json(
      { error: 'External API Error', details: error.message },
      { status: 500 }
    );
  }
}
