// Client for Torrentio Stremio Addon API
import { gotScraping } from 'got-scraping';

const BASE_URL = 'https://torrentio.strem.fun';

export interface TorrentioStream {
  name: string;
  title: string;
  infoHash: string;
  fileIdx?: number;
  behaviorHints?: {
      bingeGroup?: string;
  };
}

export interface StreamSource {
  id: string;
  name: string;
  type: 'hls' | 'mp4' | 'p2p';
  url: string;
  quality: string;
  info?: string;
  website?: string;
  seeds?: number;
  size?: string;
  filename?: string;
  codec?: string;
  infoHash?: string;
}

export async function getTorrentioStreams(imdbId: string, type: 'movie' | 'series', season?: number, episode?: number): Promise<StreamSource[]> {
  try {
    let path = '';
    if (type === 'movie') {
      path = `/stream/movie/${imdbId}.json`;
    } else {
      path = `/stream/series/${imdbId}:${season}:${episode}.json`;
    }

    const url = `${BASE_URL}${path}`;
    const response = await gotScraping(url, { responseType: 'json' });
    const data = response.body as { streams: TorrentioStream[] };

    if (!data.streams || !Array.isArray(data.streams)) return [];

    const parsedStreams = data.streams.map(stream => {
      // Parse Title for Quality and Metadata
      // Title format usually: "Filename.mkv\n👤 123 💾 1.23 GB ⚙️ Torrentio"
      const rawTitle = stream.title || '';
      const parts = rawTitle.split('\n');
      const filename = parts[0] || 'Unknown';
      const metaLine = parts[1] || '';

      // Extract Seeds
      const seedsMatch = metaLine.match(/👤\s*(\d+)/);
      const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 0;

      // Extract Size
      const sizeMatch = metaLine.match(/💾\s*([\d\.]+\s*[GM]B)/);
      const size = sizeMatch ? sizeMatch[1] : '';

      let quality = 'Unknown';
      if (filename.includes('2160p') || filename.includes('4k')) quality = '4K';
      else if (filename.includes('1080p')) quality = '1080p';
      else if (filename.includes('720p')) quality = '720p';
      else if (filename.includes('480p')) quality = '480p';

      // Detect Codec (H265/HEVC is hard for web browsers)
      const isHevc = filename.toLowerCase().includes('h.265') || 
                     filename.toLowerCase().includes('hevc') || 
                     filename.toLowerCase().includes('x265');

      const isH264 = filename.toLowerCase().includes('h.264') || 
                     filename.toLowerCase().includes('avc') || 
                     filename.toLowerCase().includes('x264');

      // Construct Magnet Link (uses internal proxy)
      const magnetUrl = `/api/stream/magnet/${stream.infoHash}?fileIdx=${stream.fileIdx || 0}`;

      // Construct User-Facing Info String
      // "1080p • 💾 1.5 GB • 👤 120"
      const infoParts = [];
      if (quality !== 'Unknown') infoParts.push(quality);
      if (size) infoParts.push(size);
      if (seeds > 0) infoParts.push(`👤 ${seeds}`);
      if (isHevc) infoParts.push('HEVC'); 
      const displayInfo = infoParts.length > 0 ? infoParts.join('  ') : filename.substring(0, 30);

      // Web Compatibility Score for Sorting
      // High seeds = Good
      // H264 = Best (Browsers play it)
      // HEVC = Risky (Chrome needs hardware support usually, or transcoding)
      // 4K = Risky (High bandwidth)
      let score = seeds;
      if (isH264) score += 10000; // Major boost for compatibility
      if (!isHevc) score += 5000; // Boost for NOT being HEVC
      if (quality === '1080p') score += 2000; // Sweet spot
      if (quality === '4K') score -= 1000; // Penalty for massive size/bandwidth reqs

      return {
        id: `torrentio-${stream.infoHash}`,
        name: stream.name || 'Torrentio',
        type: 'p2p' as const, 
        url: magnetUrl,
        quality,
        info: displayInfo, // Shows: "1080p  1.2 GB  👤 300"
        website: 'Torrentio',
        seeds,
        size,
        filename,
        codec: isHevc ? 'HEVC' : isH264 ? 'H.264' : undefined,
        infoHash: stream.infoHash,
        _score: score // Internal use for sorting
      };
    });

    // Sort by Score (Desc) then Seeds (Desc)
    return parsedStreams.sort((a, b) => b._score - a._score);

  } catch (error) {
    console.error('Torrentio fetch failed:', error);
    return [];
  }
}
