import { NextResponse } from 'next/server';
import axios from 'axios';

const API_BASE = 'https://api.imdbapi.dev';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  try {
    const response = await axios.get(`${API_BASE}/search/titles`, { params: { query } });
    return NextResponse.json(response.data);
  } catch (error) {
    return NextResponse.json({ error: 'External API Error' }, { status: 500 });
  }
}
