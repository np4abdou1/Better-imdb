import { gotScraping } from 'got-scraping';

const BASE = 'https://opensubtitles-v3.strem.io';
const ID = 'tt0182576'; // Family Guy
const SEASON = 22;
const EPISODE = 4;

// Stremio ID format for series: tt1234567:1:1
const QUERY_ID = `${ID}:${SEASON}:${EPISODE}`;

async function testStremioSubs() {
    console.log('Testing Stremio OpenSubtitles v3 Mirror...');
    // Path: /subtitles/{type}/{id}.json
    const url = `${BASE}/subtitles/series/${QUERY_ID}.json`;
    console.log(`Fetching: ${url}`);

    try {
        const res = await gotScraping(url);
        const data = JSON.parse(res.body);
        console.log(`Status: ${res.statusCode}`);
        console.log(`Found ${data.subtitles?.length || 0} subtitles.`);
        
        if (data.subtitles && data.subtitles.length > 0) {
            console.log('Sample:', data.subtitles[0]);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testStremioSubs();
