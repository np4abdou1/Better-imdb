
import { getOpenSubtitles } from '../lib/subtitle-service';

async function main() {
    console.log("Testing Subtitle Fetching...");
    
    // Inception (2010) - tt1375666
    const imdbId = 'tt1375666';
    
    console.log(`Fetching subtitles for ${imdbId}...`);
    const subs = await getOpenSubtitles(imdbId);
    
    console.log(`Found ${subs.length} subtitles.`);
    
    const arabic = subs.filter(s => s.lang === 'ara');
    console.log(`Found ${arabic.length} Arabic subtitles.`);
    
    if (arabic.length > 0) {
        console.log("Sample Arabic Subtitle:", arabic[0]);
    } else {
        console.warn("No Arabic subtitles found! Check if the movie has them or if 'ara' code is correct.");
    }

    // Check raw lang codes available
    const langs = [...new Set(subs.map(s => s.lang))];
    console.log("Available languages:", langs.join(', '));
}

main().catch(console.error);
