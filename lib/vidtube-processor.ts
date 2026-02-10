/**
 * VidTube Processor - TypeScript Implementation
 * Extracts direct video URLs from VidTube embed pages
 * Replaces Python cenima-cli processor.py
 */

import * as cheerio from 'cheerio';
import { gotScraping } from 'got-scraping';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};

const VIDTUBE_DOMAINS = [
  'vidtube.one',
  'vidtube.pro',
  'vidtube.me',
  'vidtube.to',
  'vidtube.net',
  'vidtube.watch', // Added
  'vtube.to'       // Added
];

export interface VideoSource {
  url: string;
  quality?: string;
  type?: string;
}

/**
 * VidTube Processor for extracting direct video URLs
 */
export class VidTubeProcessor {
  /**
   * Check if URL is a VidTube domain
   */
  static isVidTubeUrl(url: string): boolean {
    const urlLower = url.toLowerCase();
    // Also support 'vtube' and other variations just in case
    return VIDTUBE_DOMAINS.some(domain => urlLower.includes(domain));
  }

  /**
   * Dean Edwards Packer Unpacker
   * Ports Python _unpack logic
   */
  private unpack(p: string, a: number, c: number, k: string[]): string {
    const toBase = (n: number, b: number): string => {
      if (n === 0) return "0";
      const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
      let result = "";
      let num = n;
      while (num > 0) {
        result = digits[num % b] + result;
        num = Math.floor(num / b);
      }
      return result;
    };

    while (c--) {
      if (k[c]) {
        const token = toBase(c, a);
        const value = k[c];
        // Use a global regex to replace all instances of the token boundaries
        // This is a simplified basic implementation of the packer unpacking
        try {
           const regex = new RegExp(`\\b${token}\\b`, 'g');
           p = p.replace(regex, value);
        } catch (e) {
           // Fallback for symbols that might break regex
           const parts = p.split(token);
           if (parts.length > 1) {
             // Basic join - risky if token appears inside words not bounded by \b, 
             // but packer usually relies on \b. 
             // Ideally we should implement the full JS unpacker, 
             // but strict word boundary regex is usually enough.
           }
        }
      }
    }
    return p;
  }

  private detectAndUnpack(html: string): string | null {
    const packRegex = /return\s+p}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(\s*['"]\|['\"]\s*\)\s*\)/;
     const match = html.match(packRegex);
     
     if (match) {
        try {
          const payload = match[2];
          const radix = parseInt(match[3]);
          const count = parseInt(match[4]);
          const keywords = match[6].split('|');
          return this.unpack(payload, radix, count, keywords);
        } catch (e) {
          console.error('[VidTube] Unpack failed:', e);
        }
     }
     return null;
  }

  /**
   * Handle VidTube.one / Packer Logic
   */
  private handleVidTubeOne(html: string): string | null {
     const unpacked = this.detectAndUnpack(html);
     if (unpacked) {
         // Look for file: "..." inside unpacked code
         const m3u8Regex = /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/;
         const mp4Regex = /file\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/;
         
         const m3u = unpacked.match(m3u8Regex);
         if (m3u) return m3u[1];
         
         const mp4 = unpacked.match(mp4Regex);
         if (mp4) return mp4[1];
     } else {
         // Maybe it wasn't packed? Check raw HTML
         const m3u = html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
         if (m3u) return m3u[1];
     }
     return null;
  }

  /**
   * Handle VidTube.pro / Multi-step Logic
   */
  private async handleVidTubePro(targetUrl: string, html: string, headers: any): Promise<string | null> {
      const $ = cheerio.load(html);
      
      const priorities = [
        { suffix: '_x', label: '1080p' },
        { suffix: '_h', label: '720p' },
        { suffix: '_n', label: '480p' },
        { suffix: '_l', label: '240p' }
      ];
      
      let nextPath: string | null = null;
      
      // Look for download links ending in suffix
      $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          
          for (const p of priorities) {
              if (href.endsWith(p.suffix)) {
                  nextPath = href;
                  return false; // break cheerio loop
              }
          }
           // Fallback: look for /d/ links that aren't the current path
           if (!nextPath && href.includes('/d/') && !targetUrl.endsWith(href)) {
               nextPath = href;
           }
      });
      
      if (!nextPath) return null;
      
      // Resolve absolute URL
      const nextUrl = new URL(nextPath, targetUrl).toString();
      
      try {
          const resp = await gotScraping(nextUrl, {
             headers,
             timeout: { request: 10000 }
          });
          
          if (resp.statusCode !== 200) return null;
          
          const $2 = cheerio.load(resp.body);
          
          // Pattern 1: Download Button
          const btn = $2('a.btn.btn-gradient.submit-btn');
          if (btn.length > 0) {
              const href = btn.attr('href');
              if (href) return href;
          }
          
          // Pattern 2: Regex for mp4
          const mp4Match = resp.body.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
          if (mp4Match) return mp4Match[1];
          
      } catch (e) {
          console.error('[VidTube] handleVidTubePro failed:', e);
      }
      
      return null;
  }

  /**
   * Extract direct video URL from VidTube embed page
   */
  async extract(embedUrl: string, referer?: string): Promise<string | null> {
    if (!VidTubeProcessor.isVidTubeUrl(embedUrl)) {
      console.warn('[VidTube] Not a VidTube URL:', embedUrl);
      return null;
    }
    
    // Normalize URL
    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

    try {
      const headers: any = { ...DEFAULT_HEADERS };
      if (referer) {
        try {
            if (/[^\x00-\x7F]/.test(referer)) {
                headers['Referer'] = encodeURI(referer);
            } else {
                headers['Referer'] = referer;
            }
        
            const u = new URL(referer);
            // Protocol + Host is usually safe, but punycode might be needed for IDN domains
            // For now, assuming topcinema.rip is ASCII domain
            headers['Origin'] = `${u.protocol}//${u.host}`;
        } catch (e) {
            // If URL parse fails, skip Origin
        }
      }

      // Fetch the embed page
      const response = await gotScraping(embedUrl, {
        headers,
        timeout: { request: 15000 },
        retry: { limit: 2 }
      });

      if (response.statusCode !== 200) {
        console.error('[VidTube] Failed to fetch embed page:', response.statusCode);
        return null;
      }

      const html = response.body;
      const $ = cheerio.load(html);
      
      let videoUrl: string | null = null;
      
      // Determine strategy based on domain
      if (embedUrl.includes('vidtube.one') || /packer/i.test(html)) {
          videoUrl = this.handleVidTubeOne(html);
          if (videoUrl) return videoUrl;
      } 
      
      // Try Pro logic for .pro/.me/.to if normal extraction fails
      if (embedUrl.includes('vidtube.pro') || 
          embedUrl.includes('vidtube.me') || 
          embedUrl.includes('vidtube.to')) {
          
          videoUrl = await this.handleVidTubePro(embedUrl, html, headers);
          if (videoUrl) return videoUrl;
      }

      // Fallback: Use the original robust regex strategies
      videoUrl = this.extractFromScripts($, html);
      if (videoUrl) return videoUrl;

      // Strategy 2: Look for iframe src
      const iframeSrc = this.extractFromIframe($);
      if (iframeSrc) return iframeSrc;

      // Strategy 3: Look for source tags
      const sourceSrc = this.extractFromSource($);
      if (sourceSrc) return sourceSrc;

      console.warn('[VidTube] Could not extract video URL from:', embedUrl);
      return null;
    } catch (error: any) {
      console.error('[VidTube] Extraction error:', error.message);
      return null;
    }
  }

  /**
   * Extract video URL from JavaScript code in page
   */
  private extractFromScripts($: cheerio.CheerioAPI, html: string): string | null {
    // Check inside scripts for unpacked var file = "..." logic if previous attempts failed
    // ... (existing logic below)
    
    // Pattern 1: Look for direct .mp4 or .m3u8 URLs in scripts
    const urlPatterns = [
      /https?:\/\/[^\s"'<>]+\.mp4/gi,
      /https?:\/\/[^\s"'<>]+\.m3u8/gi,
      /https?:\/\/[^\s"'<>]+\/playlist\.m3u8/gi
    ];

    for (const pattern of urlPatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        // Return the first valid match
        for (const match of matches) {
          if (this.isValidVideoUrl(match)) {
            return match;
          }
        }
      }
    }

    // Pattern 2: Look for video URLs in JSON-like structures
    const jsonPatterns = [
      /"file"\s*:\s*"([^"]+)"/gi,
      /"src"\s*:\s*"([^"]+)"/gi,
      /"url"\s*:\s*"([^"]+)"/gi,
      /file\s*:\s*['"]([^'"]+)['"]/gi,
      /src\s*:\s*['"]([^'"]+)['"]/gi
    ];

    for (const pattern of jsonPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        const url = match[1];
        if (url && this.isValidVideoUrl(url)) {
          return url;
        }
      }
    }

    // Pattern 3: Look in specific VidTube player initialization
    const vidtubePattern = /(?:sources|player).*?['"](https?:\/\/[^'"]+\.(?:mp4|m3u8))['"]/gi;
    const vidtubeMatches = [...html.matchAll(vidtubePattern)];
    for (const match of vidtubeMatches) {
      const url = match[1];
      if (url && this.isValidVideoUrl(url)) {
        return url;
      }
    }

    return null;
  }

  /**
   * Extract video URL from iframe elements
   */
  private extractFromIframe($: cheerio.CheerioAPI): string | null {
    const iframes = $('iframe[src]');
    
    for (let i = 0; i < iframes.length; i++) {
      const src = $(iframes[i]).attr('src');
      if (src && this.isValidVideoUrl(src)) {
        return src;
      }
    }

    return null;
  }

  /**
   * Extract video URL from source/video elements
   */
  private extractFromSource($: cheerio.CheerioAPI): string | null {
    // Check video source tags
    const sources = $('video source[src], source[src]');
    
    for (let i = 0; i < sources.length; i++) {
      const src = $(sources[i]).attr('src');
      if (src && this.isValidVideoUrl(src)) {
        return src;
      }
    }

    // Check video tags directly
    const videos = $('video[src]');
    for (let i = 0; i < videos.length; i++) {
      const src = $(videos[i]).attr('src');
      if (src && this.isValidVideoUrl(src)) {
        return src;
      }
    }

    return null;
  }

  /**
   * Validate if a URL looks like a valid video URL
   */
  private isValidVideoUrl(url: string): boolean {
    if (!url || url.length < 10) return false;
    
    // Must start with http/https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }

    // Check for video file extensions or streaming formats
    const videoPatterns = [
      /\.mp4($|\?)/i,
      /\.m3u8($|\?)/i,
      /\.mpd($|\?)/i,
      /\/playlist\.m3u8/i,
      /\/master\.m3u8/i,
      /\/video\//i,
      /\/stream\//i
    ];

    return videoPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Extract all available video sources with quality information
   */
  async extractAllSources(embedUrl: string, referer?: string): Promise<VideoSource[]> {
    if (!VidTubeProcessor.isVidTubeUrl(embedUrl)) {
      return [];
    }

    try {
      const headers = { ...DEFAULT_HEADERS };
      if (referer) {
        headers['Referer'] = referer;
      }

      const response = await gotScraping(embedUrl, {
        headers,
        timeout: { request: 15000 }
      });

      if (response.statusCode !== 200) {
        return [];
      }

      const sources: VideoSource[] = [];
      const seenUrls = new Set<string>();

      // Extract all potential video URLs
      const allMatches = [
        ...response.body.matchAll(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)/gi)
      ];

      for (const match of allMatches) {
        const url = match[0];
        if (seenUrls.has(url) || !this.isValidVideoUrl(url)) {
          continue;
        }

        seenUrls.add(url);

        // Try to detect quality from URL
        let quality: string | undefined;
        if (/1080p?|1920x1080/i.test(url)) quality = '1080p';
        else if (/720p?|1280x720/i.test(url)) quality = '720p';
        else if (/480p?|854x480/i.test(url)) quality = '480p';
        else if (/360p?|640x360/i.test(url)) quality = '360p';

        const type = url.includes('.m3u8') ? 'hls' : 'mp4';

        sources.push({ url, quality, type });
      }

      // Sort by quality (highest first)
      sources.sort((a, b) => {
        const qualityOrder: Record<string, number> = {
          '1080p': 4,
          '720p': 3,
          '480p': 2,
          '360p': 1
        };
        const aOrder = qualityOrder[a.quality || ''] || 0;
        const bOrder = qualityOrder[b.quality || ''] || 0;
        return bOrder - aOrder;
      });

      return sources;
    } catch (error: any) {
      console.error('[VidTube] Failed to extract all sources:', error.message);
      return [];
    }
  }
}

// Export singleton instance
export const vidTubeProcessor = new VidTubeProcessor();
