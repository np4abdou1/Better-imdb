import { NextResponse } from 'next/server';
import axios from 'axios';

const API_BASE = 'https://api.imdbapi.dev';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const pageToken = searchParams.get('pageToken');
  const pageSize = searchParams.get('pageSize') || '20';

  try {
    const params = { pageSize };
    if (pageToken) params.pageToken = pageToken;

    const response = await axios.get(`${API_BASE}/titles/${id}/credits`, { params });
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Credits API Error:', error);
    return NextResponse.json({ error: 'External API Error' }, { status: 500 });
  }
}
