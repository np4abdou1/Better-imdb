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
  audioLanguages?: string[];
  audioMode?: string;
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
      const normalizedInfoHash = (stream.infoHash || '').trim().toLowerCase();
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

      const isAv1 =
        normalizedName.includes('av1') ||
        /\bav1\b/i.test(combinedText);

      const isH264 =
        normalizedName.includes('h.264') ||
        normalizedName.includes('avc') ||
        normalizedName.includes('x264');

      const hasAAC = /\baac\b|\baac2\.0\b|\baac 2\.0\b/i.test(combinedText);
      const hasOpus = /\bopus\b/i.test(combinedText);
      const hasMultiChannelAudio = /\b5\.1\b|\b7\.1\b|\batmos\b/i.test(combinedText);
      const hasEAC3 = /\beac3\b|\bddp\b|\bdd\+\b|dolby\s*digital\s*plus/i.test(combinedText);
      const hasAC3 = /\bac3\b(?!\+)/i.test(combinedText);
      const hasDTS = /\bdts\b|\bdtshd\b/i.test(combinedText);
      const hasTrueHD = /\btruehd\b/i.test(combinedText);
      const hasDualOrMultiAudio = /dual[-\s]?audio|multi[-\s]?audio|multiple\s+audio|2\s*audio|multi\s+lang/i.test(combinedText);
      const hasMultiSubsPack = /multi[-\s]?sub|multiple\s+sub|subs?\s*:\s*\d+|\[(?:[^\]]*sub[^\]]*)\]/i.test(combinedText);
      const isTenBit = /\b10\s*bit\b|\b10bit\b/i.test(combinedText);
      const hasDolbyVision = /dolby\s*vision|\bdv\b/i.test(combinedText);
      const hasHDR = /\bhdr\b|hdr10\+?/i.test(combinedText);

      const detectAudioLanguages = (value: string): string[] => {
        const text = value.toUpperCase();
        const langs = new Set<string>();

        const tokenMap: Array<[RegExp, string]> = [
          [/\bENG\b|\bENGLISH\b|🇬🇧|🇺🇸/i, 'English'],
          [/\bJPN\b|\bJAP\b|\bJAPANESE\b|🇯🇵/i, 'Japanese'],
          [/\bITA\b|\bITALIAN\b|🇮🇹/i, 'Italian'],
          [/\bARA\b|\bARABIC\b|🇸🇦|🇪🇬/i, 'Arabic'],
          [/\bESP\b|\bSPA\b|\bSPANISH\b|🇪🇸/i, 'Spanish'],
          [/\bLAT\b|\bLATAM\b|\bES-LA\b|🇲🇽/i, 'Spanish (LatAm)'],
          [/\bPOR\b|\bPORTUGUESE\b|\bPT-BR\b|🇵🇹|🇧🇷/i, 'Portuguese'],
          [/\bDEU\b|\bGER\b|\bGERMAN\b|🇩🇪/i, 'German'],
          [/\bFRE\b|\bFRA\b|\bFRENCH\b|🇫🇷/i, 'French'],
          [/\bRUS\b|\bRUSSIAN\b|🇷🇺/i, 'Russian'],
          [/\bKOR\b|\bKOREAN\b|🇰🇷/i, 'Korean'],
          [/\bCHI\b|\bCHINESE\b|🇨🇳/i, 'Chinese'],
          [/\bHIN\b|\bHINDI\b|🇮🇳/i, 'Hindi'],
        ];

        for (const [regex, label] of tokenMap) {
          if (regex.test(text)) langs.add(label);
        }

        return Array.from(langs);
      };

      const audioLanguages = detectAudioLanguages(combinedText);

      let audioMode = 'Single Audio';
      if (hasDualOrMultiAudio && audioLanguages.length > 2) audioMode = 'Multi Audio';
      else if (hasDualOrMultiAudio || audioLanguages.length === 2) audioMode = 'Dual Audio';

      let audioCodec: string | undefined;
      if (hasAAC) audioCodec = 'AAC';
      else if (hasOpus) audioCodec = 'Opus';
      else if (hasEAC3) audioCodec = 'EAC3';
      else if (hasAC3) audioCodec = 'AC3';
      else if (hasDTS) audioCodec = 'DTS';
      else if (hasTrueHD) audioCodec = 'TrueHD';
      
      // If no specific codec found but it is Dual Audio, it's likely a high-quality rip (often AC3/EAC3 + AAC)
      // We mark it so the client knows it might be complex
      if (!audioCodec && (hasDualOrMultiAudio || audioLanguages.length > 1)) {
        audioCodec = 'Multi'; 
      }

      // Construct Magnet Link (uses internal proxy)
      const fileIdx = Number.isInteger(stream.fileIdx) ? Number(stream.fileIdx) : 0;
      const magnetUrl = `/api/stream/magnet/${normalizedInfoHash}?fileIdx=${fileIdx}`;

      // Construct User-Facing Info String
      // "1080p • 💾 1.5 GB • 👤 120"
      const infoParts: string[] = [];
      if (quality !== 'Unknown') infoParts.push(quality);
      if (size) infoParts.push(size);
      if (seeds > 0) infoParts.push(`👤 ${seeds}`);
      if (isHevc) infoParts.push('HEVC'); 
      if (audioCodec) infoParts.push(audioCodec);
      if (hasDualOrMultiAudio) infoParts.push('Multi-Audio');
      if (hasMultiSubsPack) infoParts.push('Multi-Sub');
      if (audioLanguages.length > 0) infoParts.push(audioLanguages.slice(0, 3).join('/'));
      const displayInfo = infoParts.length > 0 ? infoParts.join('  ') : filename.substring(0, 30);

      // Web Compatibility Score for Sorting
      // High seeds = Good
      // H264 = Best (Browsers play it)
      // HEVC = Risky (Chrome needs hardware support usually, or transcoding)
      // 4K = Risky (High bandwidth)
      let score = seeds;
      if (isH264) score += 10000; // Major boost for compatibility
      if (!isHevc) score += 5000; // Boost for NOT being HEVC
      if (isHevc) score -= 6000;
      if (isAv1) score -= 9000;
      if (isMp4Container) score += 3500; // MP4 + H264 is most browser-friendly
      if (isMkvContainer) score += 300; // Keep MKV usable, but lower preference
      if (quality === '1080p') score += 2000; // Sweet spot
      if (quality === '4K') score -= 1000; // Penalty for massive size/bandwidth reqs
      if (hasAAC || hasOpus) score += 2500; // Strongly prefer browser-friendly audio
      if (hasEAC3 || hasDTS || hasTrueHD) score -= 7000; // Common "video plays but no audio" sources
      if (hasAC3) score -= 1500;
      if (hasMultiChannelAudio && !hasAAC && !hasOpus) score -= 2200;
      
      // Dual Audio Logic:
      // If it explicitly has AAC, it's great (score boost).
      // If it has NO explicit codec info, it's likely AC3/EAC3 (risky). 
      // We limit the Dual Audio boost if we aren't sure it's safe.
      if (hasDualOrMultiAudio) {
         if (hasAAC || hasOpus) score += 1500; // Safe dual audio
         else score += 200; // Unknown dual audio (risky but valuable)
      }

      if (hasMultiSubsPack) score += 250;
      if (isTenBit) score -= 1800;
      if (hasDolbyVision) score -= 1800;
      if (hasHDR && !isH264) score -= 1200;

      return {
        id: `torrentio-${normalizedInfoHash}-${fileIdx}-${index}`,
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
        audioLanguages,
        audioMode,
        infoHash: normalizedInfoHash,
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
