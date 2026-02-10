/**
 * TopCinema Show Details API
 * Get detailed information about a movie, series, or anime
 */

import { NextRequest, NextResponse } from 'next/server';
import { topCinemaScraper } from '@/lib/topcinema-scraper';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { error: 'Query parameter "url" is required' },
        { status: 400 }
      );
    }

    const details = await topCinemaScraper.getShowDetails(url);

    if (!details) {
      return NextResponse.json(
        { error: 'Show not found or failed to fetch details' },
        { status: 404 }
      );
    }

    return NextResponse.json(details);
  } catch (error: any) {
    console.error('[TopCinema API] Show details error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
