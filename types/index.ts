export interface Title {
  id: string;
  primaryTitle: string;
  originalTitle?: string;
  primaryImage?: { url: string; [key: string]: any };
  startYear?: number;
  type?: string;
  rating?: { aggregateRating: number; [key: string]: any };
  genres?: string[];
  description?: string;
  country?: { code: string; name?: string };
  countries?: { code: string; name?: string }[];
  totalSeasons?: number;
  numberOfSeasons?: number;
}

export interface StreamMapping {
  imdb_id: string;
  provider_id: string | null;
  type: string | null;
  metadata: Record<string, any> | string | null;
  cached_stream_url?: string | null;
  expires_at?: number | null;
  created_at?: string | Date;
}
