import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@flowstate/database', '@flowstate/contracts'],
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  devIndicators: false,
};
export default config;
