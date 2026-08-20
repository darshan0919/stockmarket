const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API_BACKEND_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  `http://localhost:${process.env.PORT || 5001}/api`;

const API_BASE = API_BACKEND_URL.replace(/\/api\/?$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
