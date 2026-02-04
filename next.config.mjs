/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable compression for better performance
  compress: true,

  // Optimize production bundle
  output: 'standalone',

  // Disable powered by header
  poweredByHeader: false,

  // Image optimization configuration
  images: {
    // Remote image patterns for IMDB API and TMDB
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'api.imdbapi.dev',
      },
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
      },
    ],
    // Optimize image formats with better compression
    formats: ['image/avif', 'image/webp'],
    // Device sizes for responsive images - tuned for poster cards
    deviceSizes: [320, 420, 640, 750, 828],
    // Image sizes for different layouts - smaller for posters
    imageSizes: [96, 128, 192, 256, 320],
    // Aggressive cache for better performance
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    // Reduce quality slightly for faster loading (still visually good)
    dangerouslyAllowSVG: false,
  },

  // Security and caching headers
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        // Cache static assets aggressively
        source: '/(.*).(ico|png|jpg|jpeg|gif|svg|webp|avif|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // External packages that should not be bundled (need filesystem access)
  serverExternalPackages: ['got-scraping', 'header-generator'],

  // Experimental features for better performance
  experimental: {
    // Optimize package imports for better tree-shaking
    optimizePackageImports: ['lucide-react', 'framer-motion', '@phosphor-icons/react'],
  },

  // Turbopack configuration (for dev)
  // turbo: {
  //   rules: {
  //     '*.svg': {
  //       loaders: ['@svgr/webpack'],
  //       as: '*.js',
  //     },
  //   },
  // },
};

export default nextConfig;
