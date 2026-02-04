import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

/**
 * Serverless Web Search Service
 * Uses DuckDuckGo HTML endpoint for reliable, consistent results.
 * Google and Bing actively block scrapers, so we stick with DDG which works reliably.
 */

/**
 * Search the web and return a list of result URLs
 * @param {string} query - The search query
 * @returns {Promise<Array<string>>} Array of URLs
 */
export async function searchWebUrls(query) {
  try {
    console.log(`[SearchService] Searching for: "${query}"`);
    
    const response = await gotScraping({
      url: 'https://html.duckduckgo.com/html/',
      method: 'POST',
      form: {
        q: query,
        kl: 'us-en'
      },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        devices: ['desktop'],
        locales: ['en-US'],
        operatingSystems: ['windows']
      },
      timeout: { request: 15000 },
      retry: { limit: 2 }
    });

    const $ = cheerio.load(response.body);
    const urls = [];

    $('.result').each((i, element) => {
      // Limit to top 15 results
      if (urls.length >= 15) return;

      const titleElement = $(element).find('.result__a');
      let url = titleElement.attr('href');

      // DDG sometimes wraps URLs in /l/?kh=-1&uddg=...
      if (url && url.startsWith('//duckduckgo.com/l/?')) {
         try {
             const urlObj = new URL('https:' + url);
             const uddg = urlObj.searchParams.get('uddg');
             if (uddg) url = decodeURIComponent(uddg);
         } catch(e) {}
      }
      
      // Handle relative URLs
      if (url && url.startsWith('/')) {
        url = 'https://duckduckgo.com' + url;
      }

      // Filter out ads and internal links
      if (url && 
          url.startsWith('http') && 
          !url.includes('duckduckgo.com/ad_click') &&
          !url.includes('google.com/aclk')
      ) {
        urls.push(url);
      }
    });

    console.log(`[SearchService] Found ${urls.length} URLs`);
    return urls;

  } catch (error) {
    console.error('[SearchService] Search error:', error.message);
    return [];
  }
}

/**
 * Crawl a URL and extract its main content
 * Uses got-scraping to look like a real browser
 * @param {string} url - The URL to crawl
 * @returns {Promise<Object|null>} { url, title, content } or null
 */
export async function crawlUrl(url) {
  try {
    // Basic validation
    if (!url || !url.startsWith('http')) return null;
    
    // Skip non-text files based on extension
    if (url.match(/\.(pdf|jpg|jpeg|png|gif|mp4|mp3|zip|exe|dmg)$/i)) {
      return null;
    }

    // console.log(`[SearchService] Crawling ${url}`);
    
    const response = await gotScraping({
      url,
      method: 'GET',
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        devices: ['desktop'],
        locales: ['en-US'],
        operatingSystems: ['windows']
      },
      timeout: { request: 6000 },
      retry: { limit: 0 },
      maxRedirects: 3
    });

    // Check content type
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;
    }

    if (!response.body || response.body.length < 100) {
      return null;
    }

    const $ = cheerio.load(response.body);
    
    // Remove unwanted elements
    $('script, style, noscript, meta, link, svg, iframe, nav, footer, header, aside, form, button, input').remove();
    $('.ad, .advertisement, .sidebar, .nav-menu, .menu, .cookie-banner, .popup, [aria-hidden="true"]').remove();

    // Try to get main content using common selectors
    let text = '';
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '#main-content',
      '.content',
      '.post-content',
      '.article-body', 
      '.entry-content',
      '#content',
      '.container'
    ];
    
    for (const selector of contentSelectors) {
      const elem = $(selector).first();
      if (elem.length) {
        const content = elem.text();
        if (content && content.length > 200) {
          text = content;
          break;
        }
      }
    }

    // Fallback to body if no main content found or it's too short
    if (!text || text.length < 200) {
      text = $('body').text();
    }

    // Clean whitespace and normalize
    text = text
      .replace(/\s+/g, ' ') // Replace multiple spaces/newlines with single space
      .trim();

    // Remove very long repeated character sequences (e.g. "-------")
    text = text.replace(/(.)\1{20,}/g, '');

    // Limit length (e.g. 2000 chars)
    text = text.substring(0, 2000);

    if (text.length < 100) {
      return null;
    }

    const title = $('title').text() || $('h1').first().text() || 'Untitled';
    
    return {
      url,
      title: title.substring(0, 200).trim(),
      content: text
    };

  } catch (error) {
    // console.warn(`[SearchService] Failed to crawl ${url}: ${error.code || error.message}`);
    return null;
  }
}
