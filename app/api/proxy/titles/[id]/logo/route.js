import axios from 'axios';
import { NextResponse } from 'next/server';

const IMDB_API_BASE = process.env.IMDB_API_BASE || 'https://api.imdbapi.dev';
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_API_BASE = 'https://api.themoviedb.org/3';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const logos = [];
    let bestLogo = null;

    // Try to fetch logo from TMDB if API key is available
    if (TMDB_API_KEY) {
      try {
        // First, find the TMDB ID using IMDb ID
        const findResponse = await axios.get(
          `${TMDB_API_BASE}/find/${id}`,
          {
            params: {
              api_key: TMDB_API_KEY,
              external_source: 'imdb_id'
            },
            timeout: 5000
          }
        );

        const data = findResponse.data;
        let tmdbId = null;
        let mediaType = null;

        // Check which type of content was found
        if (data.movie_results?.length > 0) {
          tmdbId = data.movie_results[0].id;
          mediaType = 'movie';
        } else if (data.tv_results?.length > 0) {
          tmdbId = data.tv_results[0].id;
          mediaType = 'tv';
        }

        // If we found a TMDB ID, fetch the images
        if (tmdbId && mediaType) {
          const imagesResponse = await axios.get(
            `${TMDB_API_BASE}/${mediaType}/${tmdbId}/images`,
            {
              params: {
                api_key: TMDB_API_KEY,
                include_image_language: 'en,null'
              },
              timeout: 5000
            }
          );

          const logoImages = imagesResponse.data?.logos || [];
          
          if (logoImages.length > 0) {
            // Filter for English/null language and wide logos (aspect ratio >= 2.0)
            const wideLangLogos = logoImages
              .filter(logo => 
                (logo.iso_639_1 === 'en' || logo.iso_639_1 === null) &&
                logo.aspect_ratio >= 2.0
              );

            if (wideLangLogos.length > 0) {
              // Sort by vote count (descending), then by aspect ratio (widest)
              const sortedLogos = wideLangLogos
                .sort((a, b) => {
                  const voteCountDiff = (b.vote_count || 0) - (a.vote_count || 0);
                  if (voteCountDiff !== 0) return voteCountDiff;
                  // If vote counts are equal, prefer wider logos
                  return (b.aspect_ratio || 0) - (a.aspect_ratio || 0);
                });

              logos.push(...sortedLogos.map(logo => ({
                url: `https://image.tmdb.org/t/p/original${logo.file_path}`,
                width: logo.width,
                height: logo.height,
                type: 'tmdb',
                aspectRatio: logo.aspect_ratio,
                voteCount: logo.vote_count
              })));

              // Best logo: highest vote count + widest
              bestLogo = `https://image.tmdb.org/t/p/original${sortedLogos[0].file_path}`;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch TMDB logo:', err.message);
      }
    }

    // Fallback: Try to get logos from IMDb API images endpoint
    if (!bestLogo) {
      try {
        const imagesResponse = await axios.get(`${IMDB_API_BASE}/titles/${id}/images`, {
          timeout: 5000,
          params: { limit: 30 }
        });

        if (imagesResponse.data?.images) {
          // Filter for actual logos (wide horizontal images, typically 2:1 to 4:1 aspect ratio)
          const logoImages = imagesResponse.data.images.filter(img => {
            if (!img.width || !img.height) return false;
            const aspectRatio = img.width / img.height;
            // True logos are wide horizontal images
            return aspectRatio >= 2.5 && aspectRatio <= 5;
          });

          logos.push(...logoImages.map(img => ({
            url: img.url,
            width: img.width,
            height: img.height,
            type: 'imdb',
            aspectRatio: img.width / img.height
          })));

          // Select best logo (prefer ~3:1 aspect ratio, common for title logos)
          if (logoImages.length > 0) {
            const idealLogo = logoImages.find(img => {
              const aspectRatio = img.width / img.height;
              return aspectRatio >= 2.8 && aspectRatio <= 3.5;
            });
            
            bestLogo = idealLogo?.url || logoImages[0].url;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch IMDb images for logo:', err.message);
      }
    }

    return NextResponse.json({
      logos,
      bestLogo,
      totalCount: logos.length
    });
  } catch (error) {
    console.error('Logo fetch error:', error.message);
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return NextResponse.json(
        { error: 'Request timeout', logos: [], bestLogo: null },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch logo', logos: [], bestLogo: null },
      { status: error.response?.status || 500 }
    );
  }
}
