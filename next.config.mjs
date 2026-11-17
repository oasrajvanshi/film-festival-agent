/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // The presentation lives in public/deck; serve it at /deck and /deck/.
  async rewrites() {
    return [{ source: '/deck', destination: '/deck/index.html' }];
  },
};
