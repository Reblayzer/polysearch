import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The polysearch library and the engine clients are Node-only and run only in
  // server route handlers. Keep them external so Next doesn't try to bundle
  // them for the browser.
  serverExternalPackages: [
    'polysearch',
    '@elastic/elasticsearch',
    '@opensearch-project/opensearch',
  ],
};

export default nextConfig;
