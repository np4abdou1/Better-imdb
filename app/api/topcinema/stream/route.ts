/**
 * TopCinema Stream Resolution API
 * Resolve streaming links for movies and episodes
 */

import { NextRequest, NextResponse } from 'next/server';
import { topCinemaScraper, Episode } from '@/lib/topcinema-scraper';
import { vidTubeProcessor } from '@/lib/vidtube-processor';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const episodeNum = searchParams.get('episode');

    if (!url) {
      return NextResponse.json(
        { error: 'Query parameter "url" is required' },
        { status: 400 }
      );
    }

    // Create a minimal episode object
    const episode: Episode = {
      episode_number: episodeNum || '1',
      display_number: episodeNum || '1',
      title: '',
      url,
      is_special: false,
      servers: []
    };

    // Fetch servers for this episode/movie
    const servers = await topCinemaScraper.fetchEpisodeServers(episode);

    if (!servers || servers.length === 0) {
      return NextResponse.json(
        { error: 'No servers found for this content' },
        { status: 404 }
      );
    }

    // Try to extract direct video URL from the first VidTube server
    let videoUrl: string | null = null;
    let selectedServer = servers[0];

    for (const server of servers) {
      if (vidTubeProcessor.constructor.name && server.embed_url) {
        videoUrl = await vidTubeProcessor.extract(server.embed_url, url);
        if (videoUrl) {
          selectedServer = server;
          break;
        }
      }
    }

    if (!videoUrl) {
      // Return embed URL if we couldn't extract direct URL
      return NextResponse.json({
        success: true,
        server_number: selectedServer.server_number,
        embed_url: selectedServer.embed_url,
        video_url: null,
        message: 'Could not extract direct video URL. Use embed_url instead.'
      });
    }

    return NextResponse.json({
      success: true,
      server_number: selectedServer.server_number,
      embed_url: selectedServer.embed_url,
      video_url: videoUrl,
      headers: {
        'Referer': selectedServer.embed_url,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  } catch (error: any) {
    console.error('[TopCinema API] Stream resolution error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
