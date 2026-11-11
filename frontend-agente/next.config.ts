import type { NextConfig } from 'next';

/**
 * El navegador solo habla con Next.js; `/api/*` se reenvía al backend NestJS (sin CORS ni puertos expuestos al navegador).
 * `BACKEND_URL` se lee al CONSTRUIR (en Docker es el argumento de build del `Dockerfile`; en local, el backend del PC).
 */
const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';

const config: NextConfig = {
  poweredByHeader: false,
  output: 'standalone', // imagen de Docker pequeña: solo lo necesario para correr
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND}/api/:path*` }];
  },
  experimental: { proxyTimeout: 600_000 },
};

export default config;
