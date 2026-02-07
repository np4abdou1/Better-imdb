import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

export class VidTubeProcessor {
    private session: AxiosInstance;

    constructor(session?: AxiosInstance) {
        if (session) {
            this.session = session;
        } else {
            this.session = axios.create({
                headers: {
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9",
                }
            });
        }
    }

    private unpack(p: string, a: number, c: number, k: string[]): string {
        const toBase = (n: number, b: number): string => {
            if (n === 0) return "0";
            const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
            let result = "";
            while (n > 0) {
                result = digits[n % b] + result;
                n = Math.floor(n / b);
            }
            return result;
        };

        for (let i = c - 1; i >= 0; i--) {
            if (i < k.length && k[i]) {
                const token = toBase(i, a);
                const value = k[i];
                // Regex to match whole word token
                const pattern = new RegExp(`\\b${token}\\b`, 'g');
                p = p.replace(pattern, () => value);
            }
        }
        return p;
    }

    private async handleVidtubeOne(html: string): Promise<string | null> {
        const packerRegex = /return\s+p}\s*\(\s*(['"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])(.*?)\5\.split\(\s*['"]\|['"]\s*\)\s*\)/s;
        const match = html.match(packerRegex);

        if (!match) return null;

        const payload = match[2];
        const radix = parseInt(match[3], 10);
        const count = parseInt(match[4], 10);
        const keywords = match[6].split('|');

        const unpackedCode = this.unpack(payload, radix, count, keywords);

        const mp4Regex = /file\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/;
        const m3u8Regex = /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/;

        const mp4Match = unpackedCode.match(mp4Regex);
        if (mp4Match) return mp4Match[1];

        const m3u8Match = unpackedCode.match(m3u8Regex);
        if (m3u8Match) return m3u8Match[1];

        return null;
    }

    private async handleVidtubePro(targetUrl: string, html: string): Promise<string | null> {
        const $ = cheerio.load(html);

        const priorities = [
            { suffix: '_x', label: '1080p' },
            { suffix: '_h', label: '720p' },
            { suffix: '_n', label: '480p' },
            { suffix: '_l', label: '240p' }
        ];

        let nextPath: string | null = null;
        
        const links = $('a[href]');

        for (const { suffix } of priorities) {
            links.each((_, el) => {
                const href = $(el).attr('href');
                if (href && href.endsWith(suffix)) {
                    nextPath = href;
                    return false; // break
                }
            });
            if (nextPath) break;
        }

        if (!nextPath) {
            // Fallback
            const pathOnly = new URL(targetUrl).pathname;
            links.each((_, el) => {
                const href = $(el).attr('href');
                if (href && href.includes('/d/') && href !== pathOnly) {
                    nextPath = href;
                    return false;
                }
            });
        }

        if (!nextPath) return null;

        const nextUrl = new URL(nextPath, targetUrl).toString();

        try {
            const resp = await this.session.get(nextUrl);
            const html2 = resp.data;
            const $2 = cheerio.load(html2);

            const btn = $2('a.btn.btn-gradient.submit-btn');
            if (btn.length > 0 && btn.attr('href')) {
                return btn.attr('href') || null;
            }

            const mp4Regex = /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/;
            const match = html2.match(mp4Regex);
            if (match) return match[1];

        } catch (e) {
            return null;
        }

        return null;
    }

    public async extract(url: string): Promise<string | null> {
        try {
            const resp = await this.session.get(url);
            const html = resp.data;
            const parsed = new URL(url);

            if (parsed.hostname.includes('vidtube.one')) {
                return this.handleVidtubeOne(html);
            } else {
                return this.handleVidtubePro(url, html);
            }
        } catch (e) {
            console.error("VidTube extract error:", e);
            return null;
        }
    }
}
