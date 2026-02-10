import { getFileFromMagnet } from '@/lib/magnet-service';
import { NextResponse } from 'next/server';

export async function GET(request: Request, props: { params: Promise<{ infoHash: string }> }) {
    const params = await props.params;
    const { infoHash } = params;
    const searchParams = new URL(request.url).searchParams;
    const fileIdx = Number(searchParams.get('fileIdx') || 0);
    const rangeHeader = request.headers.get('range');

    try {
        const file = await getFileFromMagnet(infoHash, fileIdx);
        
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
             
             const rawSrt = buffer.toString('utf-8');
             // Simple SRT to VTT conversion
             // 1. Add header
             // 2. Convert , to . in timestamps
             const vttContent = "WEBVTT\n\n" + rawSrt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

             return new NextResponse(vttContent, {
                 headers: {
                     'Content-Type': 'text/vtt',
                     'Cache-Control': 'public, max-age=3600'
                 }
             });
        }
        
        // Handle Range Requests (Crucial for video seeking)
        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            console.log(`[StreamAPI] Range Request: ${start}-${end} (${chunksize} bytes) for ${fileName}`);

            const stream = file.createReadStream({ start, end }); 


            // Create Web Stream for Response with Backpressure Handling
            const readable = new ReadableStream({
                start(controller) {
                    stream.on('data', chunk => {
                         try {
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
                        try { controller.close(); } catch(e) {}
                    });
                    stream.on('error', err => {
                        try { controller.error(err); } catch(e) {}
                    });
                },
                pull(controller) {
                    stream.resume();
                },
                cancel() {
                    (stream as any).destroy();
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
                    'Expires': '0'
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
