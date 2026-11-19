/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@shiksha/shared", "@shiksha/exam-engine"],
};

export default nextConfig;
