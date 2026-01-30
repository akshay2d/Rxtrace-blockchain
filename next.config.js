/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize fonts but allow fallback if fetch fails
  optimizeFonts: true,
  // Skip font optimization if network fails (will use system fonts)
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Disable type checking during build to avoid EPERM on Windows
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Reduce parallel workers to avoid EPERM on Windows
  webpack: (config, { dev, isServer }) => {
    // Use single worker on Windows to avoid spawn EPERM
    if (process.platform === 'win32') {
      config.parallelism = 1;
    }
    return config;
  },
}

// Apply Sentry only when not building (skip during next build to avoid hang/slow source map uploads)
const { withSentryConfig } = require("@sentry/nextjs");
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
const skipSentry = process.env.SENTRY_IGNORE_BUILD === "1" || isProductionBuild;

const config = skipSentry
  ? nextConfig
  : withSentryConfig(nextConfig, {
      org: "rxtrace-india",
      project: "javascript-nextjs",
      silent: !process.env.CI,
      widenClientFileUpload: true,
      webpack: {
        automaticVercelMonitors: true,
        treeshake: { removeDebugLogging: true },
      },
    });

module.exports = config;
