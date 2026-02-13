import { getFileFromMagnet } from '@/lib/magnet-service';
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import type { Readable } from 'stream';

// Extract embedded subtitle track from a torrent file via ffmpeg
// URL: /api/stream/subtitle-extract/[infoHash]?fileIdx=0&trackIdx=0
// Returns the subtitle converted to WebVTT

const extractionCache = new Map<string, { data: string; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function GET(request: Request, props: { params: Promise<{ infoHash: string }> }) {
  const params = await props.params;
  const infoHash = (params.infoHash || '').trim().toLowerCase();

  if (!/^[a-f0-9]{40}$/.test(infoHash)) {
    return new NextResponse('Invalid infoHash', { status: 400 });
  }

  const searchParams = new URL(request.url).searchParams;
  const fileIdx = Number(searchParams.get('fileIdx') || 0);
  const trackIdx = Number(searchParams.get('trackIdx') || 0);
  const cacheKey = `${infoHash}:${fileIdx}:${trackIdx}`;

  // Check cache
  const cached = extractionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return new NextResponse(cached.data, {
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
      }
    });
  }

  try {
    const file = await getFileFromMagnet(infoHash, fileIdx, 'video');
    if (!file) {
      return new NextResponse('File not found', { status: 404 });
    }

    const vttContent = await new Promise<string>((resolve, reject) => {
      // ffmpeg extracts the subtitle track and converts to WebVTT
      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-map', `0:s:${trackIdx}`,     // Select specific subtitle track
        '-c:s', 'webvtt',               // Convert to WebVTT
        '-f', 'webvtt',
        'pipe:1'
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';

      ffmpeg.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      ffmpeg.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      // Pipe entire file through ffmpeg (subtitle extraction needs container headers)
      const stream = file.createReadStream() as unknown as Readable;
      
      stream.pipe(ffmpeg.stdin).on('error', () => {
        // EPIPE is expected when ffmpeg finishes reading subtitle before EOF
      });

      ffmpeg.on('close', () => {
        try { stream.destroy(); } catch {}
      });

      // Timeout: subtitle extraction should be fast
      const timeout = setTimeout(() => {
        ffmpeg.kill('SIGKILL');
        stream.destroy();
        reject(new Error('Extraction timeout'));
      }, 60000);

      ffmpeg.on('close', (code) => {
        clearTimeout(timeout);
        
        if (!stdout.trim()) {
          // Check if this is a bitmap subtitle (PGS/VobSub) — can't convert to text
          if (stderr.includes('bitmap') || stderr.includes('hdmv_pgs') || stderr.includes('dvd_subtitle')) {
            reject(new Error('Bitmap subtitle (PGS/VobSub) cannot be converted to text'));
            return;
          }
          reject(new Error(`No subtitle output (code ${code})`));
          return;
        }

        resolve(stdout);
      });

      ffmpeg.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Cache extracted subtitle
    extractionCache.set(cacheKey, { data: vttContent, ts: Date.now() });

    return new NextResponse(vttContent, {
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
      }
    });
  } catch (error: any) {
    console.error('[SubExtract] Error:', error.message);
    const status = error.message.includes('Bitmap') ? 415 : 500;
    return new NextResponse(error.message, { status });
  }
}
