import { NextResponse } from 'next/server';
import axios from 'axios';
import { API_BASE, CACHE_DURATIONS, TIMEOUTS, retryWithBackoff } from '@/lib/api-config';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`${API_BASE}/titles/${id}`, {
        timeout: TIMEOUTS.DEFAULT
      })
    );

    return NextResponse.json(response.data, {
      headers: {
        'Cache-Control': CACHE_DURATIONS.TITLE_DETAILS,
      },
    });
  } catch (error) {
    console.error(`Error fetching title ${id}:`, error.message);
    const status = error.response?.status || 500;
    return NextResponse.json(
      { error: 'External API Error', details: error.message },
      { status: status === 404 ? 404 : 500 }
    );
  }
}
