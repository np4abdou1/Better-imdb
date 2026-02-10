import { resolveStreamForImdbId } from '@/lib/stream-service';
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

    // 1. Fetch TopCinema (Internal)
    // We wrap this so it doesn't block Torrentio if it fails/hangs 
    const tcPromise = resolveStreamForImdbId(id, season, episode)
        .then(stream => {
            if (stream) {
                // Determine quality metadata if possible, usually TopCinema is 720p/1080p mixed
                return {
                    id: 'topcinema',
                    name: 'TopCinema / VidTube',
                    type: 'hls' as const, // usually hls or mp4, we treat as stream
                    url: `/api/stream/watch/${id}?season=${season}&episode=${episode}`,
                    quality: 'HD',
                    info: 'Fast streaming, Embedded subtitles (Arabic)',
                    website: 'TopCinema'
                };
            }
            return null;
        })
        .catch(err => {
            console.error('TopCinema source resolve error:', err);
            return null;
        });

    // 2. Fetch Torrentio
    const torrentioPromise = getTorrentioStreams(id, type, season, episode);

    // Run in parallel
    const [tcSource, torrentioSources] = await Promise.all([tcPromise, torrentioPromise]);

    if (tcSource) {
        sources.push(tcSource);
    }
    
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
