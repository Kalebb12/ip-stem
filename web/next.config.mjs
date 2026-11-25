/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // self-contained server bundle for the Docker image
  output: "standalone",
};
export default nextConfig;
