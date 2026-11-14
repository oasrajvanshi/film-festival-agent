/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  devIndicators: false,
  // The ops API reads the festival sheets and scenario files from disk.
  outputFileTracingIncludes: { '/api/ops/**/*': ['./data/**/*'] },
};
