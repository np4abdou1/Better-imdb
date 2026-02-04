import { NextResponse } from 'next/server';
import axios from 'axios';
import { API_BASE, CACHE_DURATIONS } from '@/lib/api-config';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const pageToken = searchParams.get('pageToken');
  const pageSize = searchParams.get('pageSize') || '20';

  try {
    const queryParams = { pageSize };
    if (pageToken) queryParams.pageToken = pageToken;

    const response = await axios.get(`${API_BASE}/titles/${id}/videos`, {
      params: queryParams,
      timeout: 10000
    });

    return NextResponse.json(response.data, {
      headers: {
        'Cache-Control': CACHE_DURATIONS.MEDIA,
      },
    });
  } catch (error) {
    console.error('Videos API Error:', error);
    return NextResponse.json({ error: 'External API Error' }, { status: 500 });
  }
}
