import { resolveStreamForImdbId } from '@/lib/stream-service';
import { NextResponse } from 'next/server';

export async function GET(request, props) {
  const params = await props.params;
  const { id } = params; // IMDb ID
  
  const searchParams = request.nextUrl.searchParams;
  const season = searchParams.get('season') || 1;
  const episode = searchParams.get('episode') || 1;
  const range = request.headers.get('range');

  try {
    const streamData = await resolveStreamForImdbId(id, season, episode);
    
    if (!streamData) {
      return new NextResponse('Stream not found', { status: 404 });
    }

    const { streamUrl, headers } = streamData;
    
    const fetchHeaders = {
      ...headers,
    };
    // Forward the Range header if present
    if (range) {
      fetchHeaders['Range'] = range;
    }

    const response = await fetch(streamUrl, {
      headers: fetchHeaders,
      // Important: Disable internal decompression so we can pipe raw bytes
      compress: false 
    });

    if (!response.ok && response.status !== 206) {
        console.warn('Upstream stream fetch failed:', response.status);
        return new NextResponse(`Upstream Error: ${response.status}`, { status: 502 });
    }

    // Create a readable stream from the response body
    const responseHeaders = new Headers();
    
    // Copy relevant headers
    const headersToCopy = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition'];
    
    headersToCopy.forEach(key => {
        if (response.headers.has(key)) {
            responseHeaders.set(key, response.headers.get(key));
        }
    });

    // Force content type if missing
    if (!responseHeaders.has('content-type')) {
        responseHeaders.set('content-type', 'video/mp4');
    }
    
    // Ensure accept-ranges is set
    responseHeaders.set('Accept-Ranges', 'bytes');

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Stream proxy error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
