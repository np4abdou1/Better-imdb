import { getFileFromMagnet, prioritizeTorrentRange, recordTorrentDelivery } from '@/lib/magnet-service';
import { NextResponse } from 'next/server';
import { decodeSubtitleBuffer } from '@/lib/subtitle-text';
import { convertSubtitles } from '@/lib/srt-converter';
import { spawn } from 'child_process';
import type { Readable } from 'stream';

const MAX_RANGE_CHUNK_BYTES = 2 * 1024 * 1024; // 2MB per response chunk
const DEBUG_STREAM_LOGS = process.env.DEBUG_STREAM_LOGS === '1';

export async function GET(request: Request, props: { params: Promise<{ infoHash: string }> }) {
    const params = await props.params;
    const infoHash = (params.infoHash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(infoHash)) {
        return new NextResponse('Invalid infoHash', { status: 400 });
    }
    const searchParams = new URL(request.url).searchParams;
    const fileIdx = Number(searchParams.get('fileIdx') || 0);
    const kind = searchParams.get('kind') === 'subtitle' ? 'subtitle' : 'video';
    const rangeHeader = request.headers.get('range');
    const transcode = searchParams.get('transcode') === '1';
    const audioIdx = searchParams.get('audioIdx') || '0';

    try {
        const file = await getFileFromMagnet(infoHash, fileIdx, kind);
        
        if (!file) {
            return new NextResponse('File not found or timeout', { status: 404 });
        }

        const fileSize = file.length;
        const fileName = file.name.toLowerCase();
        
        // Determine Content-Type
        let contentType = 'video/mp4';
        if (fileName.endsWith('.mkv')) contentType = 'video/x-matroska';
        else if (fileName.endsWith('.webm')) contentType = 'video/webm';
        else if (fileName.endsWith('.avi')) contentType = 'video/x-msvideo';
        else if (fileName.endsWith('.vtt')) contentType = 'text/vtt';
        else if (fileName.endsWith('.srt')) contentType = 'text/vtt'; // We will convert SRT to VTT

        // Subtitle Handling (Convert SRT to VTT)
        if (fileName.endsWith('.srt')) {
             console.log('[StreamAPI] Converting SRT to VTT for', fileName);
             const buffer = await new Promise<Buffer>((resolve, reject) => {
                 const chunks: Buffer[] = [];
                 const s = file.createReadStream();
                 s.on('data', (c) => chunks.push(Buffer.from(c)));
                 s.on('end', () => resolve(Buffer.concat(chunks)));
                 s.on('error', reject);
             });

             const rawSrt = decodeSubtitleBuffer(buffer, 'text/plain');
             const vttContent = convertSubtitles(rawSrt);

             return new NextResponse(vttContent, {
                 headers: {
                     'Content-Type': 'text/vtt; charset=utf-8',
                     'Cache-Control': 'public, max-age=3600'
                 }
             });
        }

        // Transcoding Handling (FFmpeg)
        if (transcode) {
            console.log(`[StreamAPI] Transcoding enabled for ${infoHash} (Audio Track: ${audioIdx})`);
            
            // Spawn FFmpeg to remux video and transcode audio to AAC
            const ffmpegProc = spawn('ffmpeg', [
                '-i', 'pipe:0',           // Input from stdin
                '-map', '0:v:0',         // Select first video track
                '-map', `0:a:${audioIdx}`, // Select requested audio track
                '-c:v', 'copy',          // Copy video stream (no re-encode)
                '-c:a', 'aac',           // Transcode audio to AAC
                '-ac', '2',              // Downmix to stereo (safe compatibility)
                '-b:a', '192k',          // Audio bitrate
                '-f', 'matroska',        // Output container
                '-movflags', 'frag_keyframe+empty_moov', // Optimization for streaming (if using mp4, good for mkv too)
                'pipe:1'                 // Output to stdout
            ], { stdio: ['pipe', 'pipe', 'ignore'] }); // Ignore stderr to reduce noise, or pipe it for debug

            const fileStream = file.createReadStream() as Readable;
            fileStream.pipe(ffmpegProc.stdin).on('error', () => {}); // Handle pipe errors aggressively

            const readable = new ReadableStream({
                start(controller) {
                    ffmpegProc.stdout.on('data', chunk => controller.enqueue(chunk));
                    ffmpegProc.stdout.on('end', () => controller.close());
                    ffmpegProc.on('error', err => controller.error(err));
                    
                    // Kill ffmpeg if client disconnects heavily (handled by cancel, but good to double check)
                    ffmpegProc.on('close', () => {
                        try { controller.close(); } catch {}
                    });
                },
                cancel() {
                    console.log('[StreamAPI] Transcoding aborted by client');
                    ffmpegProc.kill('SIGKILL');
                    fileStream.destroy();
                }
            });

            return new NextResponse(readable, {
                status: 200,
                headers: {
                    'Content-Type': 'video/x-matroska',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Connection': 'keep-alive'
                }
            });
        }
        
        // Handle Range Requests (Crucial for video seeking)
        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (Number.isNaN(start) || start >= fileSize) {
                return new NextResponse('Requested range not satisfiable', {
                    status: 416,
                    headers: {
                        'Content-Range': `bytes */${fileSize}`
                    }
                });
            }

            const boundedEnd = Math.min(requestedEnd, fileSize - 1);
            const end = Math.min(start + MAX_RANGE_CHUNK_BYTES - 1, boundedEnd);
            const chunksize = (end - start) + 1;

            if (DEBUG_STREAM_LOGS) {
                console.log(`[StreamAPI] Range Request: ${start}-${end} (${chunksize} bytes) for ${fileName}`);
            }

            await prioritizeTorrentRange(infoHash, start, end);

            const stream = file.createReadStream({ start, end, highWaterMark: 256 * 1024 } as any); 
            const requestStart = Date.now();
            let bytesSent = 0;
            let lastStatUpdate = requestStart;

            const abortHandler = () => {
                try { (stream as any).destroy(); } catch (e) {}
            };
            request.signal.addEventListener('abort', abortHandler, { once: true });


            // Create Web Stream for Response with Backpressure Handling
            const readable = new ReadableStream({
                start(controller) {
                    stream.on('data', chunk => {
                         try {
                             bytesSent += chunk.length;
                             const now = Date.now();
                             if (now - lastStatUpdate >= 800) {
                                recordTorrentDelivery(infoHash, bytesSent, Math.max(1, now - requestStart));
                                lastStatUpdate = now;
                             }
                             // console.log(`[StreamAPI] Pushing chunk: ${chunk.length} bytes`);
                             controller.enqueue(chunk);
                             // Check backpressure
                             if (controller.desiredSize !== null && controller.desiredSize <= 0) {
                                 stream.pause();
                             }
                         } catch (e) {
                             (stream as any).destroy();
                         }
                    });
                    stream.on('end', () => {
                        const elapsed = Date.now() - requestStart;
                        recordTorrentDelivery(infoHash, Math.max(bytesSent, chunksize), elapsed);
                        request.signal.removeEventListener('abort', abortHandler);
                        try { controller.close(); } catch(e) {}
                    });
                    stream.on('error', err => {
                        request.signal.removeEventListener('abort', abortHandler);
                        try { controller.error(err); } catch(e) {}
                    });
                },
                pull(controller) {
                    stream.resume();
                },
                cancel() {
                    (stream as any).destroy();
                    request.signal.removeEventListener('abort', abortHandler);
                }
            });

            return new NextResponse(readable, {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize.toString(),
                    'Content-Type': contentType,
                    // Disable cache control to force fresh requests for ranges
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'Connection': 'keep-alive'
                },
            });

        } else {
            // No range, return whole file (rare for video players)
            const stream = file.createReadStream();
            const readable = new ReadableStream({
                start(controller) {
                    stream.on('data', chunk => controller.enqueue(chunk));
                    stream.on('end', () => controller.close());
                },
                cancel() {
                    (stream as any).destroy();
                }
            });

            return new NextResponse(readable, {
                headers: {
                    'Content-Length': fileSize.toString(),
                    'Content-Type': contentType,
                },
            });
        }

    } catch (error: any) {
        console.error('[MagnetAPI] Error:', error.message);
        return new NextResponse(`Server Error: ${error.message}`, { status: 500 });
    }
}
