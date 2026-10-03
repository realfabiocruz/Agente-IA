import type { NextConfig } from 'next';

// O navegador fala só com o Next em /api; o Next repassa para a API NestJS.
// Assim funciona igual no localhost e atrás de um endereço único (ex.: Codespaces).
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/:path*` }];
  },
};

export default nextConfig;
