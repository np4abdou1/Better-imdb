import { getTorrentioStreams, StreamSource } from '@/lib/torrentio';
import { NextResponse } from 'next/server';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const searchParams = new URL(request.url).searchParams;
  const season = Number(searchParams.get('season') || 1);
  const episode = Number(searchParams.get('episode') || 1);
  const type = (searchParams.get('type') || 'series') as 'movie' | 'series';

  try {
    const sources: StreamSource[] = [];

    // 1. Add TopCinema optimistically (non-blocking)
    // Full resolution happens in /api/stream/watch when user selects it.
    const tcSource: StreamSource = {
      id: 'topcinema',
      name: 'TopCinema / VidTube',
      type: 'hls' as const,
      url: `/api/stream/watch/${id}?season=${season}&episode=${episode}`,
      quality: 'HD',
      info: 'Direct streaming source',
      website: 'TopCinema'
    };
    sources.push(tcSource);

    // 2. Fetch Torrentio
    const torrentioPromise = getTorrentioStreams(id, type, season, episode);

    // Run provider fetches in parallel where possible
    const torrentioSources = await torrentioPromise;
    
    if (torrentioSources) {
        // Limit torrentio results to top 5 to avoid clutter
        sources.push(...torrentioSources.slice(0, 10)); // Top 10
    }

    return NextResponse.json({ sources });

  } catch (error) {
    console.error('Sources error:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
