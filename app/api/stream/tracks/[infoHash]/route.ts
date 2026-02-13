import { getFileFromMagnet } from '@/lib/magnet-service';
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import type { Readable } from 'stream';

export interface TrackInfo {
  index: number;         // Stream index in container
  trackIndex: number;    // Index within its type (0-indexed)
  type: 'audio' | 'subtitle';
  codec: string;
  codecLong?: string;
  language?: string;
  title?: string;
  channels?: number;
  channelLayout?: string;
  sampleRate?: number;
  bitRate?: number;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface TracksResponse {
  audio: TrackInfo[];
  subtitle: TrackInfo[];
  video: {
    codec?: string;
    width?: number;
    height?: number;
    fps?: string;
    bitRate?: number;
  } | null;
  filename: string;
  fileSize: number;
  duration?: number;
}

// Cache probe results (infoHash+fileIdx -> result) — probing is expensive
const probeCache = new Map<string, { data: TracksResponse; ts: number }>();
const PROBE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const PROBE_PENDING = new Map<string, Promise<TracksResponse>>();

// Language code to name mapping
const LANG_MAP: Record<string, string> = {
  eng: 'English', en: 'English',
  jpn: 'Japanese', ja: 'Japanese',
  ara: 'Arabic', ar: 'Arabic',
  spa: 'Spanish', es: 'Spanish',
  fre: 'French', fra: 'French', fr: 'French',
  ger: 'German', deu: 'German', de: 'German',
  ita: 'Italian', it: 'Italian',
  por: 'Portuguese', pt: 'Portuguese',
  pob: 'Portuguese (BR)',
  rus: 'Russian', ru: 'Russian',
  kor: 'Korean', ko: 'Korean',
  chi: 'Chinese', zho: 'Chinese', zh: 'Chinese',
  hin: 'Hindi', hi: 'Hindi',
  tur: 'Turkish', tr: 'Turkish',
  dut: 'Dutch', nld: 'Dutch', nl: 'Dutch',
  swe: 'Swedish', sv: 'Swedish',
  pol: 'Polish', pl: 'Polish',
  vie: 'Vietnamese', vi: 'Vietnamese',
  tha: 'Thai', th: 'Thai',
  fin: 'Finnish', fi: 'Finnish',
  nor: 'Norwegian', no: 'Norwegian',
  dan: 'Danish', da: 'Danish',
  heb: 'Hebrew', he: 'Hebrew',
  hun: 'Hungarian', hu: 'Hungarian',
  cze: 'Czech', ces: 'Czech', cs: 'Czech',
  rum: 'Romanian', ron: 'Romanian', ro: 'Romanian',
  gre: 'Greek', ell: 'Greek', el: 'Greek',
  ind: 'Indonesian', id: 'Indonesian',
  may: 'Malay', msa: 'Malay', ms: 'Malay',
  ukr: 'Ukrainian', uk: 'Ukrainian',
  bul: 'Bulgarian', bg: 'Bulgarian',
  hrv: 'Croatian', hr: 'Croatian',
  srp: 'Serbian', sr: 'Serbian',
  und: 'Undetermined',
};

function getLanguageName(code?: string): string {
  if (!code) return 'Unknown';
  return LANG_MAP[code.toLowerCase()] || code.toUpperCase();
}

async function probeFile(infoHash: string, fileIdx: number): Promise<TracksResponse> {
  const file = await getFileFromMagnet(infoHash, fileIdx, 'video');
  if (!file) throw new Error('File not found');

  return new Promise((resolve, reject) => {
    // Use ffprobe on piped input - read first 20MB which is enough for container headers
    const PROBE_BYTES = 20 * 1024 * 1024;
    
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-probesize', '20000000',    // 20MB probe size
      '-analyzeduration', '10000000', // 10s analysis
      'pipe:0'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let pipeFinished = false;
    
    ffprobe.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    ffprobe.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    // Pipe limited bytes from torrent file
    const stream = file.createReadStream({ start: 0, end: Math.min(PROBE_BYTES, file.length - 1) } as any) as unknown as Readable;
    
    stream.pipe(ffprobe.stdin).on('error', () => {
      // Ignore EPIPE (ffprobe got enough data and closed)
    });

    // Safety: if ffprobe already exited, destroy stream
    ffprobe.on('close', () => {
      if (!pipeFinished) {
        pipeFinished = true;
        try { stream.destroy(); } catch {}
      }
    });

    // Timeout after 30s
    const timeout = setTimeout(() => {
      ffprobe.kill('SIGKILL');
      stream.destroy();
      reject(new Error('ffprobe timeout'));
    }, 30000);

    ffprobe.on('close', (code) => {
      clearTimeout(timeout);
      
      if (!stdout.trim()) {
        reject(new Error(`ffprobe returned no output (code ${code})`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        const format = data.format || {};

        const audio: TrackInfo[] = [];
        const subtitle: TrackInfo[] = [];
        let video: TracksResponse['video'] = null;
        let audioIdx = 0;
        let subIdx = 0;

        for (const stream of streams) {
          const tags = stream.tags || stream.TAG || {};
          const lang = tags.language || tags.LANGUAGE;
          const title = tags.title || tags.TITLE;
          const disposition = stream.disposition || {};

          if (stream.codec_type === 'audio') {
            audio.push({
              index: stream.index,
              trackIndex: audioIdx++,
              type: 'audio',
              codec: stream.codec_name || 'unknown',
              codecLong: stream.codec_long_name,
              language: lang,
              title: title,
              channels: stream.channels,
              channelLayout: stream.channel_layout,
              sampleRate: stream.sample_rate ? parseInt(stream.sample_rate) : undefined,
              bitRate: stream.bit_rate ? parseInt(stream.bit_rate) : undefined,
              isDefault: disposition.default === 1,
              isForced: disposition.forced === 1,
            });
          } else if (stream.codec_type === 'subtitle') {
            subtitle.push({
              index: stream.index,
              trackIndex: subIdx++,
              type: 'subtitle',
              codec: stream.codec_name || 'unknown',
              codecLong: stream.codec_long_name,
              language: lang,
              title: title,
              isDefault: disposition.default === 1,
              isForced: disposition.forced === 1,
            });
          } else if (stream.codec_type === 'video' && !video) {
            video = {
              codec: stream.codec_name,
              width: stream.width,
              height: stream.height,
              fps: stream.r_frame_rate,
              bitRate: stream.bit_rate ? parseInt(stream.bit_rate) : undefined,
            };
          }
        }

        // Build human-readable labels for audio tracks
        for (const track of audio) {
          if (!track.title) {
            const parts: string[] = [];
            parts.push(getLanguageName(track.language));
            if (track.channels) {
              if (track.channels === 2) parts.push('Stereo');
              else if (track.channels === 6) parts.push('5.1');
              else if (track.channels === 8) parts.push('7.1');
              else parts.push(`${track.channels}ch`);
            }
            const codecDisplay = (track.codec || '').toUpperCase();
            if (codecDisplay && codecDisplay !== 'UNKNOWN') parts.push(codecDisplay);
            track.title = parts.join(' · ');
          }
        }

        // Build labels for subtitle tracks  
        for (const track of subtitle) {
          if (!track.title) {
            const parts: string[] = [];
            parts.push(getLanguageName(track.language));
            if (track.isForced) parts.push('(Forced)');
            if (track.codec) {
              const subCodec = track.codec.toUpperCase();
              if (subCodec === 'ASS' || subCodec === 'SSA') parts.push('ASS');
              else if (subCodec === 'SUBRIP' || subCodec === 'SRT') parts.push('SRT');
              else if (subCodec === 'WEBVTT') parts.push('VTT');
              else if (subCodec === 'HDMV_PGS_SUBTITLE' || subCodec === 'PGS') parts.push('PGS');
              else if (subCodec === 'DVD_SUBTITLE' || subCodec === 'VOBSUB') parts.push('VobSub');
            }
            track.title = parts.join(' · ');
          }
        }

        const result: TracksResponse = {
          audio,
          subtitle,
          video,
          filename: file.name,
          fileSize: file.length,
          duration: format.duration ? parseFloat(format.duration) : undefined,
        };

        resolve(result);
      } catch (e: any) {
        reject(new Error(`ffprobe parse error: ${e.message}`));
      }
    });
  });
}

export async function GET(request: Request, props: { params: Promise<{ infoHash: string }> }) {
  const params = await props.params;
  const infoHash = (params.infoHash || '').trim().toLowerCase();
  
  if (!/^[a-f0-9]{40}$/.test(infoHash)) {
    return NextResponse.json({ error: 'Invalid infoHash' }, { status: 400 });
  }

  const searchParams = new URL(request.url).searchParams;
  const fileIdx = Number(searchParams.get('fileIdx') || 0);
  const cacheKey = `${infoHash}:${fileIdx}`;

  // Check cache
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PROBE_CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Deduplicate concurrent requests for same file
  let pending = PROBE_PENDING.get(cacheKey);
  if (!pending) {
    pending = probeFile(infoHash, fileIdx);
    PROBE_PENDING.set(cacheKey, pending);
  }

  try {
    const result = await pending;
    probeCache.set(cacheKey, { data: result, ts: Date.now() });
    PROBE_PENDING.delete(cacheKey);
    return NextResponse.json(result);
  } catch (error: any) {
    PROBE_PENDING.delete(cacheKey);
    console.error('[TracksAPI] Probe error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
