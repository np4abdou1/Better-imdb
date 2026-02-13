/**
 * TopCinema Scraper - TypeScript Implementation
 * Integrated scraper for TopCinema content (movies, series, anime)
 * Replaces Python cenima-cli scraper.py
 */

import * as cheerio from 'cheerio';
import { gotScraping } from 'got-scraping';
import type { CheerioAPI } from 'cheerio';

// Configuration
const BASE_URL = 'https://topcinema.rip';
const REQUEST_TIMEOUT = Number(process.env.TOPCINEMA_TIMEOUT_MS || 45000); // 45 seconds default
const SERIES_DETAILS_TIMEOUT = Number(process.env.TOPCINEMA_SERIES_TIMEOUT_MS || 65000);
const RETRY_ATTEMPTS = Number(process.env.TOPCINEMA_RETRY_ATTEMPTS || 4);

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0'
};

const AJAX_HEADERS = {
  ...DEFAULT_HEADERS,
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  'Accept': '*/*',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin'
};

// Type Definitions
export interface SearchResult {
  title: string;
  url: string;
  type: 'movie' | 'series' | 'anime';
  metadata: {
    year?: number;
    poster?: string;
    quality?: string;
    rating?: number;
  };
}

export interface Episode {
  episode_number: string;
  display_number: string;
  title: string;
  url: string;
  is_special: boolean;
  servers: Server[];
}

export interface Season {
  season_number: number;
  season_part?: string;
  display_label: string;
  url: string;
  poster?: string;
  episodes: Episode[];
}

export interface Server {
  server_number: number;
  embed_url: string;
  video_url?: string;
}

export interface ShowDetails {
  title: string;
  url: string;
  type: 'movie' | 'series' | 'anime';
  poster?: string;
  synopsis?: string;
  imdb_rating?: number;
  year?: number;
  genres?: string[];
  quality?: string;
  trailer?: string;
  seasons?: Season[];
  servers?: Server[];
}

// Utility Functions
function cleanText(text: string): string {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ');
}

function cleanArabicTitle(text: string): string {
  if (!text) return text;
  
  // Remove Arabic characters
  text = text.replace(/[\u0600-\u06FF]+/g, '');
  
  // Remove duplicate numbers
  const parts = text.split(/\s+/);
  const seenNumbers = new Set<string>();
  const cleaned: string[] = [];
  
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      if (!seenNumbers.has(part)) {
        cleaned.push(part);
        seenNumbers.add(part);
      }
    } else {
      cleaned.push(part);
    }
  }
  
  text = cleaned.join(' ').replace(/\s+/g, ' ').trim();
  return text;
}

function parseEpisodeNumber(epStr: string): number {
  if (!epStr) return 99999;
  
  const str = String(epStr).trim();
  
  if (str.toLowerCase() === 'special' || str === '0') {
    return 0;
  }
  
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  
  return 99999;
}

function extractSeasonNumber(text: string): number {
  const decoded = decodeURIComponent(text);
  const normalized = decoded.toLowerCase().replace(/[-_]/g, ' ');
  
  // Check for final season markers
  if (/final|نهائي|الأخير/.test(normalized)) {
    const partMatch = normalized.match(/(?:part|الجزء|جزء)[- ]?(\d+)/);
    if (partMatch) {
      return 100 + parseInt(partMatch[1]);
    }
    return 100;
  }
  
  // Arabic ordinals (must check longer phrases first)
  const arabicOrdinals: Record<string, number> = {
    'الحادي عشر': 11, 'حادي عشر': 11,
    'الثاني عشر': 12, 'ثاني عشر': 12,
    'الثالث عشر': 13, 'ثالث عشر': 13,
    'الرابع عشر': 14, 'رابع عشر': 14,
    'الخامس عشر': 15, 'خامس عشر': 15,
    'السادس عشر': 16, 'سادس عشر': 16,
    'السابع عشر': 17, 'سابع عشر': 17,
    'الثامن عشر': 18, 'ثامن عشر': 18,
    'التاسع عشر': 19, 'تاسع عشر': 19,
    'العشرون': 20, 'عشرون': 20,
    'العاشر': 10, 'عاشر': 10,
    'التاسع': 9, 'تاسع': 9,
    'الثامن': 8, 'ثامن': 8,
    'السابع': 7, 'سابع': 7,
    'السادس': 6, 'سادس': 6,
    'الخامس': 5, 'خامس': 5,
    'الرابع': 4, 'رابع': 4,
    'الثالث': 3, 'ثالث': 3,
    'الثاني': 2, 'ثاني': 2,
    'الاول': 1, 'الأول': 1, 'اول': 1,
  };
  
  // Sort by length (longest first) to match compound phrases
  const sortedOrdinals = Object.keys(arabicOrdinals).sort((a, b) => b.length - a.length);
  for (const ordinal of sortedOrdinals) {
    if (normalized.includes(ordinal)) {
      return arabicOrdinals[ordinal];
    }
  }
  
  // Check for season number patterns
  const match = normalized.match(/(?:الموسم|season)[- ]?(\d+)|(?:^|\/)s(\d+)(?:$|\/)/);
  if (match) {
    return parseInt(match[1] || match[2]);
  }
  
  return 1;
}

function extractSeasonPart(text: string): string | null {
  const decoded = decodeURIComponent(text).toLowerCase();
  
  const partMatch = decoded.match(/(?:part|الجزء|جزء)[- ]?(\d+)|p(\d+)/i);
  if (partMatch) {
    const partNum = partMatch[1] || partMatch[2];
    return `Part ${partNum}`;
  }
  
  if (/(الجزء الثاني|part 2|cour 2)/.test(decoded)) {
    return 'Part 2';
  } else if (/(الجزء الاول|part 1|cour 1)/.test(decoded)) {
    return 'Part 1';
  }
  
  return null;
}

// Main Scraper Class
export class TopCinemaScraper {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private getEndpoint(type: 'search' | 'server' | 'trailer'): string {
    const endpoints = {
      search: `${this.baseUrl}/wp-content/themes/movies2023/Ajaxat/Searching.php`,
      server: `${this.baseUrl}/wp-content/themes/movies2023/Ajaxat/Single/Server.php`,
      trailer: `${this.baseUrl}/wp-content/themes/movies2023/Ajaxat/Home/LoadTrailer.php`
    };
    return endpoints[type];
  }

  /**
   * Search for content on TopCinema
   */
  async search(query: string, contentType?: 'movie' | 'series' | 'anime'): Promise<SearchResult[]> {
    try {
      const response = await gotScraping.post(this.getEndpoint('search'), {
        form: { search: query, type: 'all' },
        headers: {
          ...AJAX_HEADERS,
          'Referer': this.baseUrl,
          'Origin': this.baseUrl
        },
        timeout: { request: REQUEST_TIMEOUT },
        retry: { limit: RETRY_ATTEMPTS }
      });

      const $ = cheerio.load(response.body);
      const results: SearchResult[] = [];

      $('.Small--Box').each((_, item) => {
        const result = this.parseSearchResult($(item));
        if (result) {
          if (contentType && result.type !== contentType) {
            return;
          }
          results.push(result);
        }
      });

      return results;
    } catch (error: any) {
      console.error('[TopCinema] Search failed:', error.message);
      return [];
    }
  }

  private parseSearchResult($item: cheerio.Cheerio<any>): SearchResult | null {
    try {
      const link = $item.find('a').first();
      const url = link.attr('href');
      if (!url) return null;

      const titleElem = $item.find('.title, .Title, h3').first();
      const title = cleanText(titleElem.text() || link.attr('title') || 'Unknown');

      // Detect content type
      const decodedUrl = decodeURIComponent(url).toLowerCase();
      let showType: 'movie' | 'series' | 'anime' = 'movie';

      if (/(انمي|\/anime\/)/.test(decodedUrl) || /(انمي|anime)/i.test(title)) {
        showType = 'anime';
      } else if (/(مسلسل|\/series\/)/.test(decodedUrl) || /(مسلسل|series)/i.test(title)) {
        showType = 'series';
      } else if (/(فيلم|\/movie\/)/.test(decodedUrl) || /(فيلم|movie)/i.test(title)) {
        showType = 'movie';
      }

      const metadata: SearchResult['metadata'] = {};

      // Quality
      const ribbon = $item.find('.ribbon').first();
      if (ribbon.length) {
        metadata.quality = cleanText(ribbon.text());
      }

      // Year
      const yearElem = $item.find('[class*="year"]').first();
      if (yearElem.length) {
        const yearMatch = yearElem.text().match(/(\d{4})/);
        if (yearMatch) {
          metadata.year = parseInt(yearMatch[1]);
        }
      }

      // Poster
      const img = $item.find('img').first();
      if (img.length) {
        metadata.poster = img.attr('data-src') || img.attr('src');
      }

      return {
        title,
        url,
        type: showType,
        metadata
      };
    } catch (error) {
      console.warn('[TopCinema] Failed to parse search result:', error);
      return null;
    }
  }

  /**
   * Get detailed information about a show
   */
  async getShowDetails(url: string): Promise<ShowDetails | null> {
    try {
      const decodedUrl = decodeURIComponent(url);
      
      if (/(فيلم|\/movie\/)/.test(decodedUrl)) {
        return this.getMovieDetails(url);
      } else if (/(انمي|\/anime\/)/.test(decodedUrl)) {
        return this.getSeriesDetails(url, 'anime');
      } else if (/(مسلسل|\/series\/)/.test(decodedUrl)) {
        return this.getSeriesDetails(url, 'series');
      }

      // Try series first, fallback to movie
      const result = await this.getSeriesDetails(url);
      if (result?.seasons) {
        return result;
      }
      return this.getMovieDetails(url);
    } catch (error: any) {
      console.error('[TopCinema] Failed to get show details:', error.message);
      return null;
    }
  }

  /**
   * Get movie details
   */
  private async getMovieDetails(url: string): Promise<ShowDetails | null> {
    try {
      const response = await gotScraping(url, {
        headers: DEFAULT_HEADERS,
        timeout: { request: REQUEST_TIMEOUT }
      });

      const $ = cheerio.load(response.body);
      const details = this.parseMetadata($, url);
      details.type = 'movie';

      const movieId = this.extractContentId(url, $);
      if (movieId) {
        const watchUrl = `${url.replace(/\/$/, '')}/watch/`;
        details.servers = await this.getServers(movieId, watchUrl);
      }

      return details;
    } catch (error: any) {
      console.error('[TopCinema] Failed to get movie details:', error.message);
      return null;
    }
  }

  /**
   * Get series/anime details with seasons
   */
  private async getSeriesDetails(url: string, showType: 'series' | 'anime' = 'series'): Promise<ShowDetails | null> {
    try {
      let response: any = null;
      let lastError: any = null;

      const safeUrl = /[^\x00-\x7F]/.test(url) ? encodeURI(url) : url;

      for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
        try {
          response = await gotScraping(safeUrl, {
            headers: DEFAULT_HEADERS,
            timeout: { request: SERIES_DETAILS_TIMEOUT + attempt * 10000 },
            retry: { limit: 1 },
          });
          break;
        } catch (error: any) {
          lastError = error;
          if (attempt < RETRY_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
          }
        }
      }

      if (!response) {
        throw lastError || new Error('Series details request failed');
      }

      const $ = cheerio.load(response.body);
      const details = this.parseMetadata($, url);
      details.type = showType;

      // Find season links
      const seasonLinks: string[] = [];
      const seenUrls = new Set<string>();

      $('.Small--Box.Season a[href]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href && !seenUrls.has(href)) {
          seasonLinks.push(href);
          seenUrls.add(href);
        }
      });

      // Fallback: look for season links in all links
      if (seasonLinks.length === 0) {
        $('a[href]').each((_, elem) => {
          const href = $(elem).attr('href') || '';
          if ((/(\/series\/|\/anime\/)/.test(href)) && 
              (/(الموسم|season)/i.test(href) || /(season|الموسم)/i.test($(elem).text()))) {
            if (!seenUrls.has(href)) {
              seasonLinks.push(href);
              seenUrls.add(href);
            }
          }
        });
      }

      // If no seasons found, use main URL as season 1
      if (seasonLinks.length === 0) {
        seasonLinks.push(url);
      }

      const seasons: Season[] = [];
      for (const seasonUrl of seasonLinks) {
        const seasonNum = extractSeasonNumber(seasonUrl);
        const seasonPart = extractSeasonPart(seasonUrl);

        let displayLabel: string;
        if (seasonNum >= 100) {
          displayLabel = seasonPart ? `Final ${seasonPart}` : 'Final Season';
        } else if (seasonPart) {
          displayLabel = `Season ${seasonNum} ${seasonPart}`;
        } else {
          displayLabel = `Season ${seasonNum}`;
        }

        seasons.push({
          season_number: seasonNum,
          season_part: seasonPart || undefined,
          display_label: displayLabel,
          url: seasonUrl,
          episodes: []
        });
      }

      seasons.sort((a, b) => a.season_number - b.season_number);
      details.seasons = seasons;

      return details;
    } catch (error: any) {
      console.error('[TopCinema] Failed to get series details:', error.message);
      return null;
    }
  }

  private parseMetadata($: CheerioAPI, url: string): ShowDetails {
    const metadata: ShowDetails = { title: 'Unknown Title', url, type: 'movie' };

    // Title
    const titleElem = $('h1.post-title, h1, h2[class*="title"]').first();
    if (titleElem.length) {
      metadata.title = cleanText(titleElem.text());
    }

    // Poster
    const poster = $('img[class*="poster"]').first();
    if (poster.length) {
      metadata.poster = poster.attr('data-src') || poster.attr('src');
    }

    // Synopsis
    const synopsis = $('[class*="synopsis"], [class*="description"], [class*="story"]').first();
    if (synopsis.length) {
      metadata.synopsis = cleanText(synopsis.text());
    }

    // IMDb Rating
    const ratingText = $('*:contains("IMDb")').first().parent().text();
    const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
    if (ratingMatch) {
      metadata.imdb_rating = parseFloat(ratingMatch[1]);
    }

    // Year
    const yearText = $('*:contains("سنة"), *:contains("year")').first().parent().text();
    const yearMatch = yearText.match(/(\d{4})/);
    if (yearMatch) {
      metadata.year = parseInt(yearMatch[1]);
    }

    // Genres
    const genres: string[] = [];
    $('a[href*="genre"]').each((_, elem) => {
      const genre = cleanText($(elem).text());
      if (genre) genres.push(genre);
    });
    if (genres.length > 0) {
      metadata.genres = genres;
    }

    return metadata;
  }

  /**
   * Get servers for a movie or episode
   */
  async getServers(contentId: string, referer: string, maxServers: number = 10): Promise<Server[]> {
    const servers: Server[] = [];

    // Ensure referer is encoded for headers
    // got-scraping/Node http throws if headers contain unicode
    let encodedReferer = referer;
    try {
        if (/[^\x00-\x7F]/.test(referer)) {
             encodedReferer = encodeURI(referer);
        }
    } catch { }

    for (let i = 0; i < maxServers; i++) {
      try {
        const response = await gotScraping.post(this.getEndpoint('server'), {
          form: { id: contentId, i: i.toString() },
          headers: {
            ...AJAX_HEADERS,
            'Referer': encodedReferer,
            'Origin': this.baseUrl
          },
          timeout: { request: 5000 }
        });

        if (response.statusCode === 200 && response.body) {
          const $ = cheerio.load(response.body);
          const iframe = $('iframe').first();
          const embedUrl = iframe.attr('src');

          if (embedUrl) {
            servers.push({
              server_number: i,
              embed_url: embedUrl
            });
          }
        }
      } catch (error) {
        // Silent fail for individual servers
      }
    }

    return servers;
  }

  /**
   * Extract content ID from page
   */
  private extractContentId(url: string, $: CheerioAPI): string | null {
    // Check Li elements in server list
    const serverLi = $('ul.servers-list li, .server--item, li[data-server]').first();
    const dataId = serverLi.attr('data-id');
    if (dataId && /^\d+$/.test(dataId)) {
      return dataId;
    }

    // Look for data-id attributes
    const dataIdElem = $('[data-id]').first();
    const id = dataIdElem.attr('data-id');
    if (id && /^\d+$/.test(id)) {
      return id;
    }

    // Check for WordPress post ID in classes
    const postClass = $('[class*="post-"]').first();
    const classes = postClass.attr('class') || '';
    const postMatch = classes.match(/post-(\d+)/);
    if (postMatch) {
      return postMatch[1];
    }

    // Check shortlink
    const shortlink = $('link[rel="shortlink"]').attr('href');
    if (shortlink) {
      const match = shortlink.match(/p=(\d+)/);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Fetch episodes for a season
   */
  async fetchSeasonEpisodes(season: Season): Promise<Episode[]> {
    if (season.episodes && season.episodes.length > 0) {
      return season.episodes;
    }

    const episodes: Episode[] = [];
    const seenUrls = new Set<string>();
    
    // Prepare list URL Logic mimicking Python scraper
    const baseUrl = season.url.replace(/\/$/, '');
    
    let useListEndpoint = false;
    let listUrlCandidate = baseUrl;
    
    // Python Logic: "If the URL is ... often needs /list for full pagination"
    // "if page doesn't have episodes, we might need /list"
    // Python defaults to checking /list if not present.
    if (!baseUrl.endsWith('/list')) {
        // Assume we might need it for anime/series to get linear list
        useListEndpoint = true;
        listUrlCandidate = `${baseUrl}/list`;
    } else {
        listUrlCandidate = baseUrl;
    }

    let page = 1;
    const maxPages = 50;
    
    let firstTryUrl = useListEndpoint ? listUrlCandidate : baseUrl;
    let fallbackMode = false;

    while (page <= maxPages) {
      try {
        let currentUrl: string;
        
        if (page === 1) {
            currentUrl = (fallbackMode) ? baseUrl : firstTryUrl;
        } else {
            // TopCinema Pagination: /?page=2 or /page/2/
            // Python used /?page=X mostly, but TS user /page/X/
            // Let's support both or try one. The TS version used /page/X/, let's stick to that 
            // OR match Python's: f"{base_url}/?page={page}"
            // NOTE: Python code specifically uses query param: f"{base_url}/?page={page}"
            
            const baseForPage = fallbackMode ? baseUrl : firstTryUrl;
            // Let's try the Python approach first as requested
            currentUrl = `${baseForPage}/?page=${page}`;
        }

        const response = await gotScraping(currentUrl, {
          headers: DEFAULT_HEADERS,
          timeout: { request: REQUEST_TIMEOUT },
          throwHttpErrors: false // Handle 404 manually for fallback
        });

        // specific fallback logic
        if (response.statusCode === 404 && page === 1 && useListEndpoint && !fallbackMode) {
            fallbackMode = true;
            continue;
        }

        if (response.statusCode !== 200) break;

        const $ = cheerio.load(response.body);
        let foundNew = false;
        
        // Selectors Logic from Python (Ordered by priority)
        let episodeAnchors = $('.allepcont .row > a');
        
        if (episodeAnchors.length === 0) {
            episodeAnchors = $('.allepcont a');
        }
        
        // Python Method 3: Generic search with validation (skipped for simplicity unless needed)
        
        // Existing TS Selector (Python includes this as specific fallback)
        if (episodeAnchors.length === 0) {
            episodeAnchors = $('.Episodes--Seasons--Episodes a');
        }

        episodeAnchors.each((_, elem) => {
          const url = $(elem).attr('href');
          if (!url || seenUrls.has(url)) return;

          const episode = this.parseEpisodeLink($(elem), url);
          if (episode) {
            episodes.push(episode);
            seenUrls.add(url);
            foundNew = true;
          }
        });

        // If simple selectors failed, try the generic link search (mimicking Python)
        if (!foundNew && episodes.length === 0) {
             $('a[href]').each((_, elem) => {
                 const $link = $(elem);
                 const href = $link.attr('href') || '';
                 if (!href || seenUrls.has(href)) return;
                 
                 const title = $link.attr('title') || '';
                 const text = $link.text();
                 
                 // Heuristic checks
                 const isEpLink = (
                    $link.find('.epnum').length > 0 ||
                    /الحلقة|Episode|ep/i.test(title) ||
                    /الحلقة|Episode|ep/i.test(text) ||
                    /episode/.test(href.toLowerCase()) ||
                    (href.includes('watch') && $link.hasClass('button'))
                 );
                 
                 if (isEpLink) {
                     const episode = this.parseEpisodeLink($link, href);
                     if (episode) {
                         episodes.push(episode);
                         seenUrls.add(href);
                         foundNew = true;
                     }
                 }
             });
        }
        
        if (!foundNew && page > 1) break; // Stop if no new episodes found on subsequent pages
        if (!foundNew && page === 1 && episodes.length > 0) break; // Should we stop? Python continues until no episodes or next page fails

        // Check for next page button
        const nextPage = $('.page-numbers.next').length > 0 || 
                         $(`a[href*="page=${page + 1}"]`).length > 0;
        
        if (!nextPage && !foundNew) break;
        
        page++;
      } catch (error) {
        if (page === 1 && !fallbackMode) {
             // If first page crashed try fallback? No, Python raises.
        }
        break;
      }
    }

    episodes.sort((a, b) => parseEpisodeNumber(a.episode_number) - parseEpisodeNumber(b.episode_number));
    season.episodes = episodes;
    return episodes;
  }

  private parseEpisodeLink($elem: cheerio.Cheerio<any>, url: string): Episode | null {
    try {
      if (/(\/category\/|\/genre\/)/.test(url)) {
        return null;
      }

      const epText = cleanText($elem.text());
      const titleAttr = $elem.attr('title') || '';

      // Check for special episodes
      let isSpecial = false;
      let specialType: string | null = null;
      if (/(ova|special|movie|خاص)/i.test(url)) {
        isSpecial = true;
        if (/ova/i.test(url)) specialType = 'OVA';
        else if (/movie/i.test(url)) specialType = 'Movie';
        else specialType = 'Special';
      }

      // Try to extract episode number
      let epMatch = url.match(/(?:الحلقة|episode|ep)[- ]?(\d+(?:\.\d+)?)/i);
      if (!epMatch) epMatch = titleAttr.match(/(?:الحلقة|episode|ep)[- ]?(\d+(?:\.\d+)?)/i);
      if (!epMatch) epMatch = epText.match(/(?:الحلقة|episode|ep)[- ]?(\d+(?:\.\d+)?)/i);

      let epNumStr: string;
      let displayNum: string;

      if (!epMatch) {
        if (isSpecial) {
          epNumStr = '0';
          displayNum = specialType || 'Special';
        } else {
          epNumStr = '?';
          displayNum = '?';
        }
      } else {
        epNumStr = epMatch[1];
        displayNum = specialType ? `${specialType} ${epNumStr}` : epNumStr;
      }

      const cleanTitle = cleanArabicTitle(epText || titleAttr || '');

      return {
        episode_number: epNumStr,
        display_number: displayNum,
        title: cleanTitle,
        url,
        is_special: isSpecial,
        servers: []
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Fetch servers for an episode
   */
  async fetchEpisodeServers(episode: Episode): Promise<Server[]> {
    if (episode.servers && episode.servers.length > 0) {
      return episode.servers;
    }

    const watchUrl = episode.url.endsWith('/watch/') 
      ? episode.url 
      : `${episode.url.replace(/\/$/, '')}/watch/`;

    try {
      const response = await gotScraping(watchUrl, {
        headers: DEFAULT_HEADERS,
        timeout: { request: REQUEST_TIMEOUT }
      });

      const $ = cheerio.load(response.body);
      const episodeId = this.extractContentId(watchUrl, $);

      if (!episodeId) {
        return [];
      }

      const servers = await this.getServers(episodeId, watchUrl);
      episode.servers = servers;
      return servers;
    } catch (error: any) {
      console.error('[TopCinema] Failed to fetch episode servers:', error.message);
      return [];
    }
  }
}

// Export singleton instance
export const topCinemaScraper = new TopCinemaScraper();
