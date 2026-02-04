const AMAZON_HOST_PATTERN = /https?:\/\/(?:m\.)?media-amazon\.com\//i;
const TMDB_HOST_PATTERN = /https?:\/\/image\.tmdb\.org\//i;

export function amazonImageLoader({ src, width }) {
  if (!src) {
    return src;
  }

  // Handle TMDB images
  if (TMDB_HOST_PATTERN.test(src)) {
    // TMDB supports width in the path: /t/p/w500/...
    try {
      const url = new URL(src);
      // Replace /original/ with appropriate size
      if (url.pathname.includes('/original/')) {
        const sizeMap = {
          // Map Next.js widths to TMDB sizes
          96: 'w92',
          128: 'w154',
          192: 'w185',
          256: 'w342',
          320: 'w500',
          420: 'w500',
          640: 'w780',
          750: 'w780',
          828: 'w1280',
        };
        const tmdbSize = sizeMap[width] || 'w780';
        url.pathname = url.pathname.replace('/original/', `/${tmdbSize}/`);
        return url.toString();
      }
      return src;
    } catch (error) {
      return src;
    }
  }

  // Handle Amazon images
  if (!AMAZON_HOST_PATTERN.test(src)) {
    return src;
  }

  try {
    const url = new URL(src);
    const sizeToken = `._V1_UX${width}_`;

    if (url.pathname.includes('._V1_')) {
      url.pathname = url.pathname.replace('._V1_', sizeToken);
      return url.toString();
    }

    if (url.pathname.includes('_V1_')) {
      url.pathname = url.pathname.replace('_V1_', `_V1_UX${width}_`);
      return url.toString();
    }
  } catch (error) {
    return src;
  }

  return src;
}
