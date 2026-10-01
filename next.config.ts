import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* ─── Strict Mode ────────────────────────────────────────────────────── */
  reactStrictMode: true,

  /* ─── TypeScript & ESLint ───────────────────────────────────────────── */
  typescript: {
    // Fail the production build if there are type errors
    ignoreBuildErrors: false,
  },

  /* ─── Security Headers ───────────────────────────────────────────────── */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  /* ─── Image Optimization ─────────────────────────────────────────────── */
  images: {
    formats: ['image/avif', 'image/webp'],
    dangerouslyAllowSVG: false,
  },

  /* ─── Compiler ───────────────────────────────────────────────────────── */
  compiler: {
    // Remove console.log in production (console.warn/error kept)
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['warn', 'error'] }
        : false,
  },

  /* ─── Logging ────────────────────────────────────────────────────────── */
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
};

export default nextConfig;
