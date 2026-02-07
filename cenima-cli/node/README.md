# Cenima CLI - Node.js Backend

This is a Node.js port of the Cenima CLI backend logic. It serves as an API for searching and streaming content from TopCinema.

## Setup

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Build the project:**
    ```bash
    npm run build
    ```

3.  **Start the server:**
    ```bash
    npm start
    ```

    Or for development:
    ```bash
    npm run dev
    ```

## API Endpoints

-   `GET /health`: Health check.
-   `GET /search?q=QUERY&type=TYPE`: Search for movies/series/anime.
-   `GET /show/details?url=URL`: Get details for a show.
-   `GET /season/episodes?url=SEASON_URL`: Get episodes for a season.
-   `GET /stream/resolve?url=EPISODE_URL`: Resolve streaming links for an episode.
-   `GET /vidtube/extract?url=EMBED_URL`: Extract video URL from VidTube embed.

## Configuration

Configuration is located in `src/config.ts`.
