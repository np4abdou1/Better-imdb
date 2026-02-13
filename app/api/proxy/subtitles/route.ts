// Proxy external SRT/VTT files to avoid CORS
import { NextRequest, NextResponse } from 'next/server';
import { fetch as fetchNode } from 'undici';
import { convertSubtitles } from '@/lib/srt-converter';
import { decodeSubtitleBuffer } from '@/lib/subtitle-text';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
let subtitleQueue: Promise<void> = Promise.resolve();

const queueSubtitleFetch = async <T>(task: () => Promise<T>): Promise<T> => {
    const run = subtitleQueue
        .catch(() => undefined)
        .then(() => task());
    subtitleQueue = run.then(() => undefined, () => undefined);
    return run;
};

async function fetchWithRetry(url: string, retries = 2): Promise<{ text: string; contentType: string | null }> {
    for (let i = 0; i <= retries; i++) {
        const res = await fetchNode(url);
        if (res.ok) {
            const contentType = res.headers.get('content-type');
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const text = decodeSubtitleBuffer(buffer, contentType);
            return { text, contentType };
        }
        if (res.status === 429 && i < retries) {
            // Much longer backoff for rate limiting: 5s, 10s, 20s
            const backoffMs = [5000, 10000, 20000][i];
            console.log(`[SubtitleProxy] 429 rate limit, backing off ${backoffMs}ms (retry ${i + 1}/${retries})`);
            await delay(backoffMs);
            continue;
        }
        throw new Error(`Fetch failed: ${res.status}`);
    }
    throw new Error('Exhausted retries');
}

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) return new NextResponse('Missing url', { status: 400 });

    try {
        const { text } = await queueSubtitleFetch(() => fetchWithRetry(url));
        
        // Use robust conversion or fallback to simple pass-through if it's already VTT
        const output = convertSubtitles(text);

        return new NextResponse(output, {
            headers: {
                'Content-Type': 'text/vtt; charset=utf-8',
                'Cache-Control': 'public, max-age=86400'
            }
        });

    } catch (e: any) {
        console.error('Subtitle proxy error:', e);
        return new NextResponse('Error fetching subtitle', { status: 500 });
    }
}
