import express, { Request, Response } from 'express';
import cors from 'cors';
import { TopCinemaScraper } from './services/scraper';
import { VidTubeProcessor } from './services/processor';
import { cleanShowTitle } from './utils/helpers';
import { StreamSource } from './types';

const app = express();
const port = process.env.PORT || 8000;
const scraper = new TopCinemaScraper();

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: "ok", domain: scraper.baseUrl });
});

app.get('/search', async (req: Request, res: Response): Promise<void> => {
    const q = req.query.q as string;
    const type = req.query.type as string | undefined;

    if (!q) {
        res.status(400).json({ error: "Query parameter 'q' is required" });
        return;
    }

    const results = await scraper.search(q, type);
    res.json(results);
});

app.get('/show/details', async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string;
    
    if (!url) {
        res.status(400).json({ error: "Query parameter 'url' is required" });
        return;
    }

    const details = await scraper.getShowDetails(url);
    if (!details) {
        res.status(404).json({ error: "Show not found" });
        return;
    }

    res.json(details);
});

app.get('/season/episodes', async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string;

    if (!url) {
        res.status(400).json({ error: "Query parameter 'url' is required" });
        return;
    }

    // Create a dummy season object to reuse the method
    const dummySeason: any = { url };
    const episodes = await scraper.fetchSeasonEpisodes(dummySeason);
    
    res.json(episodes);
});

app.get('/stream/resolve', async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string;

    if (!url) {
        res.status(400).json({ error: "Query parameter 'url' is required" });
        return;
    }

    // Create dummy episode
    const dummyEpisode: any = { url };
    const servers = await scraper.fetchEpisodeServers(dummyEpisode);

    if (!servers || servers.length === 0) {
        res.status(404).json({ error: "No working servers found" });
        return;
    }

    const selected = servers[0];
    const referer = scraper.baseUrl;
    // We can't easily get the specific request UA used in scraper without exposing it, 
    // but we know what we set in config.
    const ua = scraper.session.defaults.headers["User-Agent"] as string; 
    
    // Note: session.defaults might differ in structure depending on axios version, 
    // but in create() we passed it. 
    // Safest is to use the one from config or scraper instance.
    
    const mpvCmd = `mpv "${selected.video_url}" --referrer="${referer}" --user-agent="${ua}" --vo=gpu --x11-bypass-compositor=no`;

    const response: StreamSource = {
        server_number: selected.server_number,
        embed_url: selected.embed_url,
        video_url: selected.video_url || "",
        headers: {
            "Referer": referer,
            "User-Agent": ua
        },
        mpv_command: mpvCmd
    };

    res.json(response);
});

app.get('/vidtube/extract', async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string;
    if (!url) {
        res.status(400).json({ error: "Query parameter 'url' is required" });
        return;
    }

    const processor = new VidTubeProcessor();
    const videoUrl = await processor.extract(url);
    
    if (!videoUrl) {
        res.status(404).json({ error: "Could not extract video" });
        return;
    }
    
    res.json({ video_url: videoUrl });
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

export default app;
