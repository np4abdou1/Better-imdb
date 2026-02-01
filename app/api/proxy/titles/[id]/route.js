import { NextResponse } from 'next/server';
import axios from 'axios';

const API_BASE = 'https://api.imdbapi.dev';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const response = await axios.get(`${API_BASE}/titles/${id}`);
    return NextResponse.json(response.data);
  } catch (error) {
    return NextResponse.json({ error: 'External API Error' }, { status: 500 });
  }
}
