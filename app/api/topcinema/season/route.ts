/**
 * TopCinema Season Episodes API
 * Get all episodes for a specific season
 */

import { NextRequest, NextResponse } from 'next/server';
import { topCinemaScraper, Season } from '@/lib/topcinema-scraper';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, season: seasonNumber } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'Body parameter "url" is required' },
        { status: 400 }
      );
    }

    // Create a minimal season object
    const season: Season = {
      season_number: seasonNumber ? parseInt(seasonNumber) : 1,
      display_label: `Season ${seasonNumber || 1}`,
      url,
      episodes: []
    };

    const episodes = await topCinemaScraper.fetchSeasonEpisodes(season);

    return NextResponse.json({
      url,
      season_number: season.season_number,
      episode_count: episodes.length,
      episodes
    });
  } catch (error: any) {
    console.error('[TopCinema API] Season episodes error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

