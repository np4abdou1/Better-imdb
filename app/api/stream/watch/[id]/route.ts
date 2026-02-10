import { resolveStreamForImdbId } from '@/lib/stream-service';
import { NextResponse } from 'next/server';
import { gotScraping } from 'got-scraping';
import { Readable } from 'stream';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  const { id } = params; // IMDb ID
  
  const searchParams = new URL(request.url).searchParams;
  const season = Number(searchParams.get('season') || 1);
  const episode = Number(searchParams.get('episode') || 1);
  const range = request.headers.get('range');

  try {
    const streamData = await resolveStreamForImdbId(id, season, episode);
    
    if (!streamData) {
      return new NextResponse('Stream not found', { status: 404 });
    }

    const { streamUrl, headers } = streamData;
    
    // Pass headers from resolver (Referer, User-Agent)
    const fetchHeaders: Record<string, string> = {};
    
    if (headers) {
        Object.entries(headers).forEach(([key, value]) => {
            fetchHeaders[key] = value as string;
        });
    }

    // Forward the Range header if present
    if (range) {
      fetchHeaders['Range'] = range;
    }

    // Use got-scraping stream to bypass potential blocking/firewalls
    const proxyStream = gotScraping.stream(streamUrl, {
        headers: fetchHeaders,
        retry: { limit: 2, methods: ['GET'] },
        // Ensure we don't mess with compression for video streams
        decompress: false,
        // Disable HTTP2 as it causes timeouts with some video CDNs
        http2: false,
        timeout: {
            request: 20000 // 20s timeout
        }
    });

    return new Promise<Response>((resolve) => {
        proxyStream.on('response', (response) => {
            // Create headers for the downstream response
            const responseHeaders = new Headers();
            
            const headersToCopy = [
                'content-type', 
                'content-length', 
                'content-range', 
                'accept-ranges', 
                'content-disposition'
            ];
            
            headersToCopy.forEach(key => {
                if (response.headers[key]) {
                    const value = response.headers[key];
                    if (Array.isArray(value)) {
                        responseHeaders.set(key, value[0]);
                    } else if (value) {
                         responseHeaders.set(key, value);
                    }
                }
            });

            // Force content type if missing
            if (!responseHeaders.has('content-type')) {
                responseHeaders.set('content-type', 'video/mp4');
            }
            
            // Ensure accept-ranges is set
            responseHeaders.set('Accept-Ranges', 'bytes');

            // Convert Node stream to Web stream for NextResponse
            const webStream = Readable.toWeb(proxyStream) as ReadableStream<Uint8Array>;

            resolve(new NextResponse(webStream, {
                status: response.statusCode || 200,
                headers: responseHeaders,
            }));
        });

        proxyStream.on('error', (err) => {
            console.error('Stream proxy error:', err);
            resolve(new NextResponse('Upstream Error', { status: 502 }));
        });
    });

  } catch (error) {
    console.error('Stream proxy error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
