/** @type {import('next').Config} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.avsshield.com',
    NEXT_PUBLIC_WEBSITE_URL: process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://avsshield.com',
    NEXT_PUBLIC_DASHBOARD_URL: process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'https://dashboard.avsshield.com',
    NEXT_PUBLIC_COOKIE_DOMAIN: process.env.NEXT_PUBLIC_COOKIE_DOMAIN ?? '.avsshield.com',
  },
};

module.exports = nextConfig;
