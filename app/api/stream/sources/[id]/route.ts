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
        const isCompatibleAudio = (source: StreamSource) => {
          const audio = (source.audioCodec || '').toLowerCase();
          if (!audio) return false;
          if (audio.includes('aac') || audio.includes('opus') || audio.includes('ac3')) return true;
          return false;
        };

        const isDualAudio = (source: StreamSource) => {
          const mode = (source.audioMode || '').toLowerCase();
          if (mode.includes('dual') || mode.includes('multi')) return true;
          const text = `${source.filename || ''} ${source.info || ''}`.toLowerCase();
          return /dual[-\s]?audio|multi[-\s]?audio|multiple\s+audio/.test(text);
        };

        const MAX_TORRENT_SOURCES = 10;
        const MIN_COMPATIBLE = 3;
        const MIN_DUAL_COMPATIBLE = 2;

        const compatible = torrentioSources.filter(isCompatibleAudio);
        const dualCompatible = torrentioSources.filter((s) => isCompatibleAudio(s) && isDualAudio(s));
        const baseTop = torrentioSources.slice(0, MAX_TORRENT_SOURCES);

        const selected = [...baseTop];
        const selectedIds = new Set(selected.map((s) => s.id));

        let compatibleCount = selected.filter(isCompatibleAudio).length;
        if (compatibleCount < MIN_COMPATIBLE) {
          for (const candidate of compatible) {
            if (selectedIds.has(candidate.id)) continue;
            selected.push(candidate);
            selectedIds.add(candidate.id);
            compatibleCount++;
            if (compatibleCount >= MIN_COMPATIBLE) break;
          }
        }

        const hasAnyDual = torrentioSources.some(isDualAudio);
        if (hasAnyDual) {
          let dualCompatibleCount = selected.filter((s) => isCompatibleAudio(s) && isDualAudio(s)).length;
          if (dualCompatibleCount < MIN_DUAL_COMPATIBLE) {
            for (const candidate of dualCompatible) {
              if (selectedIds.has(candidate.id)) continue;
              selected.push(candidate);
              selectedIds.add(candidate.id);
              dualCompatibleCount++;
              if (dualCompatibleCount >= MIN_DUAL_COMPATIBLE) break;
            }
          }
        }

        // keep stable order by original ranking
        const rankedSelected = torrentioSources.filter((s) => selectedIds.has(s.id)).slice(0, MAX_TORRENT_SOURCES);
        sources.push(...rankedSelected);
    }

    return NextResponse.json({ sources });

  } catch (error) {
    console.error('Sources error:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
