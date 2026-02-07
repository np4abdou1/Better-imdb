const axios = require('axios');

const BASE_URL = 'http://localhost:8000';

async function runTests() {
    try {
        console.log("1. Testing Search for 'Breaking Bad'...");
        const searchRes = await axios.get(`${BASE_URL}/search?q=Breaking Bad`);
        
        if (searchRes.data.length === 0) {
            console.error("No results found!");
            return;
        }
        
        const firstShow = searchRes.data[0];
        console.log(`   Found: ${firstShow.title} (${firstShow.url})`);

        console.log("\n2. Testing Get Details...");
        const detailsRes = await axios.get(`${BASE_URL}/show/details`, {
            params: { url: firstShow.url }
        });
        const details = detailsRes.data;
        console.log(`   Title: ${details.title}`);
        console.log(`   Seasons: ${details.seasons.length}`);

        if (details.seasons.length > 0) {
            const firstSeason = details.seasons[0];
            console.log(`\n3. Testing Get Episodes for Season ${firstSeason.season_number}...`);
            console.log(`   Season URL: ${firstSeason.url}`);
            
            const episodesRes = await axios.get(`${BASE_URL}/season/episodes`, {
                params: { url: firstSeason.url }
            });
            const episodes = episodesRes.data;
            console.log(`   Found ${episodes.length} episodes.`);

            if (episodes.length > 0) {
                const firstEp = episodes[0];
                console.log(`\n4. Testing Stream Resolve for Episode 1 (${firstEp.title})...`);
                console.log(`   Episode URL: ${firstEp.url}`);

                try {
                    const streamRes = await axios.get(`${BASE_URL}/stream/resolve`, {
                        params: { url: firstEp.url }
                    });
                    console.log("   Stream Resolved Successfully!");
                    console.log(`   Video URL: ${streamRes.data.video_url}`);
                    console.log(`   MPV Command: ${streamRes.data.mpv_command}`);
                } catch (e) {
                    console.error("   Stream resolution failed:", e.message);
                    if (e.response) {
                        console.error("   Status:", e.response.status);
                        console.error("   Data:", e.response.data);
                    }
                }
            }
        } else {
            console.log("   No seasons found, skipping episode/stream tests.");
        }

    } catch (error) {
        console.error("Test failed:", error.message);
        if (error.response) {
            console.error("Response data:", error.response.data);
        }
    }
}

setTimeout(runTests, 2000);
