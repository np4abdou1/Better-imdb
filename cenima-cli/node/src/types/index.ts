export enum ContentType {
    MOVIE = "movie",
    SERIES = "series",
    ANIME = "anime",
    UNKNOWN = "unknown"
}

export interface Metadata {
    year?: number;
    rating?: number;
    imdb_rating?: number;
    quality?: string;
    poster?: string;
    genres: string[];
    synopsis?: string;
    cast: string[];
    directors: string[];
    duration?: string;
    language?: string;
    country?: string;
    trailer?: string;
    episode_count?: string;
    release_year?: string;
    [key: string]: any;
}

export interface StreamLink {
    name: string;
    server_number: number;
    embed_url: string;
    video_url?: string;
}

export interface Episode {
    episode_number: string;
    display_number: string;
    title: string;
    url: string;
    is_special: boolean;
    servers: StreamLink[];
}

export interface Season {
    season_number: number;
    season_part?: string;
    display_label: string;
    url: string;
    poster?: string;
    episodes: Episode[];
}

export interface Show {
    title: string;
    url: string;
    type: ContentType | string;
    metadata: Metadata;
    seasons: Season[];
    servers: StreamLink[];
}

export interface SearchResult {
    title: string;
    original_title?: string;
    url: string;
    type: string;
    year?: number;
    rating?: number;
    poster?: string;
    quality?: string;
    metadata?: Partial<Metadata>;
}

export interface StreamSource {
    server_number: number;
    embed_url: string;
    video_url: string;
    headers: Record<string, string>;
    mpv_command: string;
}
