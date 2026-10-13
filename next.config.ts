import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the demo is always opened at 127.0.0.1 (localhost does not resolve on some demo machines)
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
