// Fix for connection limit / ghost streams
import { NextRequest, NextResponse } from 'next/server';
import { destroyTorrent, destroyAllTorrents } from '@/lib/magnet-service';

export async function POST(request: NextRequest) {
    try {
        let body: any = {};
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            body = await request.json().catch(() => ({}));
        } else {
            const text = await request.text().catch(() => '');
            if (text) {
                try {
                    body = JSON.parse(text);
                } catch {
                    body = {};
                }
            }
        }

        const { infoHash, all } = body;
        
        if (all) {
            destroyAllTorrents();
            return NextResponse.json({ ok: true, message: 'All torrents destroyed' });
        }
        
        if (!infoHash) return new NextResponse('Missing infoHash', { status: 400 });

        destroyTorrent(infoHash);
        
        return NextResponse.json({ ok: true });
    } catch (e) {
        return new NextResponse('Error', { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const infoHash = request.nextUrl.searchParams.get('infoHash');
    const all = request.nextUrl.searchParams.get('all');

    if (all === '1' || all === 'true') {
        destroyAllTorrents();
        return NextResponse.json({ ok: true, message: 'All torrents destroyed' });
    }

    if (!infoHash) {
        return new NextResponse('Missing infoHash', { status: 400 });
    }

    destroyTorrent(infoHash);
    return NextResponse.json({ ok: true });
}