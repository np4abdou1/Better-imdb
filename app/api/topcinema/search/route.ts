/**
 * TopCinema Search API
 * Search for movies, series, and anime
 */

import { NextRequest, NextResponse } from 'next/server';
import { topCinemaScraper } from '@/lib/topcinema-scraper';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const type = searchParams.get('type') as 'movie' | 'series' | 'anime' | null;

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    if (type && !['movie', 'series', 'anime'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be: movie, series, or anime' },
        { status: 400 }
      );
    }

    const results = await topCinemaScraper.search(query, type || undefined);

   return NextResponse.json({
      query,
      type: type || 'all',
      count: results.length,
      results
    });
  } catch (error: any) {
    console.error('[TopCinema API] Search error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
