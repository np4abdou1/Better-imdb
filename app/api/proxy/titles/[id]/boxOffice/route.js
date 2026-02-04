import { NextResponse } from 'next/server';
import axios from 'axios';
import { API_BASE, CACHE_DURATIONS, TIMEOUTS, retryWithBackoff } from '@/lib/api-config';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`${API_BASE}/titles/${id}/boxOffice`, {
        timeout: TIMEOUTS.DEFAULT
      })
    );

    return NextResponse.json(response.data, {
      headers: {
        'Cache-Control': CACHE_DURATIONS.MEDIA,
      },
    });
  } catch (error) {
    console.error('Box Office API Error:', error.message);
    
    // Return null for graceful degradation
    if (error.response?.status === 404) {
      return NextResponse.json(null, { 
        status: 200,
        headers: { 'Cache-Control': CACHE_DURATIONS.MEDIA }
      });
    }
    
    return NextResponse.json({ error: 'External API Error' }, { status: 500 });
  }
}
