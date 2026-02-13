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
  audioCodec?: string;
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

    const parsedStreams = data.streams.map((stream, index) => {
      const rawTitle = stream.title || '';
      const lines = rawTitle
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const filename = lines[0] || stream.name || 'Unknown';
      const metaText = lines.slice(1).join(' | ');
      const combinedText = `${filename} | ${metaText}`;

      const seedsRegexes = [
        /👤\s*(\d+)/i,
        /seed(?:s|ers)?\s*[:=]?\s*(\d+)/i,
        /peers?\s*[:=]?\s*(\d+)/i,
      ];

      let seeds = 0;
      for (const regex of seedsRegexes) {
        const match = combinedText.match(regex);
        if (match?.[1]) {
          seeds = parseInt(match[1], 10) || 0;
          if (seeds > 0) break;
        }
      }

      const sizeMatch = combinedText.match(/(?:💾\s*)?(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i);
      const size = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : '';

      const normalizedName = filename.toLowerCase();
      let quality = 'Unknown';
      if (/2160p|\b4k\b/i.test(combinedText)) quality = '4K';
      else if (/1080p/i.test(combinedText)) quality = '1080p';
      else if (/720p/i.test(combinedText)) quality = '720p';
      else if (/480p/i.test(combinedText)) quality = '480p';

      const isMp4Container = normalizedName.endsWith('.mp4') || /\bmp4\b/i.test(combinedText);
      const isMkvContainer = normalizedName.endsWith('.mkv') || /\bmkv\b/i.test(combinedText);

      const isHevc =
        normalizedName.includes('h.265') ||
        normalizedName.includes('hevc') ||
        normalizedName.includes('x265');

      const isH264 =
        normalizedName.includes('h.264') ||
        normalizedName.includes('avc') ||
        normalizedName.includes('x264');

      const hasAAC = /\baac\b|\baac2\.0\b|\baac 2\.0\b/i.test(combinedText);
      const hasOpus = /\bopus\b/i.test(combinedText);
      const hasEAC3 = /\beac3\b|\bddp\b|\bdd\+\b|dolby\s*digital\s*plus/i.test(combinedText);
      const hasAC3 = /\bac3\b(?!\+)/i.test(combinedText);
      const hasDTS = /\bdts\b|\bdtshd\b/i.test(combinedText);
      const hasTrueHD = /\btruehd\b/i.test(combinedText);

      let audioCodec: string | undefined;
      if (hasAAC) audioCodec = 'AAC';
      else if (hasOpus) audioCodec = 'Opus';
      else if (hasEAC3) audioCodec = 'EAC3';
      else if (hasAC3) audioCodec = 'AC3';
      else if (hasDTS) audioCodec = 'DTS';
      else if (hasTrueHD) audioCodec = 'TrueHD';

      // Construct Magnet Link (uses internal proxy)
      const fileIdx = Number.isInteger(stream.fileIdx) ? Number(stream.fileIdx) : 0;
      const magnetUrl = `/api/stream/magnet/${stream.infoHash}?fileIdx=${fileIdx}`;

      // Construct User-Facing Info String
      // "1080p • 💾 1.5 GB • 👤 120"
      const infoParts: string[] = [];
      if (quality !== 'Unknown') infoParts.push(quality);
      if (size) infoParts.push(size);
      if (seeds > 0) infoParts.push(`👤 ${seeds}`);
      if (isHevc) infoParts.push('HEVC'); 
      if (audioCodec) infoParts.push(audioCodec);
      const displayInfo = infoParts.length > 0 ? infoParts.join('  ') : filename.substring(0, 30);

      // Web Compatibility Score for Sorting
      // High seeds = Good
      // H264 = Best (Browsers play it)
      // HEVC = Risky (Chrome needs hardware support usually, or transcoding)
      // 4K = Risky (High bandwidth)
      let score = seeds;
      if (isH264) score += 10000; // Major boost for compatibility
      if (!isHevc) score += 5000; // Boost for NOT being HEVC
      if (isMp4Container) score += 3500; // MP4 + H264 is most browser-friendly
      if (isMkvContainer) score += 300; // Keep MKV usable, but lower preference
      if (quality === '1080p') score += 2000; // Sweet spot
      if (quality === '4K') score -= 1000; // Penalty for massive size/bandwidth reqs
      if (hasAAC || hasOpus) score += 2500; // Strongly prefer browser-friendly audio
      if (hasEAC3 || hasDTS || hasTrueHD) score -= 7000; // Common "video plays but no audio" sources
      if (hasAC3) score -= 1500;

      return {
        id: `torrentio-${stream.infoHash}-${fileIdx}-${index}`,
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
        audioCodec,
        infoHash: stream.infoHash,
        _score: score
      };
    });

    // Sort by Score (Desc) then Seeds (Desc)
    return parsedStreams.sort((a, b) => {
      const scoreDiff = (b as any)._score - (a as any)._score;
      if (scoreDiff !== 0) return scoreDiff;
      return (b.seeds || 0) - (a.seeds || 0);
    });

  } catch (error) {
    console.error('Torrentio fetch failed:', error);
    return [];
  }
}
