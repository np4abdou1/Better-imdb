import { NextResponse } from 'next/server';
import axios from 'axios';
import { API_BASE, CACHE_DURATIONS, TIMEOUTS, retryWithBackoff } from '@/lib/api-config';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`${API_BASE}/titles/${id}/seasons`, {
        timeout: TIMEOUTS.DEFAULT
      })
    );

    return NextResponse.json(response.data, {
      headers: {
        'Cache-Control': CACHE_DURATIONS.MEDIA,
      },
    });
  } catch (error) {
    console.error(`Error fetching seasons for ${id}:`, error.message);
    return NextResponse.json({ error: 'External API Error', seasons: [] }, { status: 500 });
  }
}
