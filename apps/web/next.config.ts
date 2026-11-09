import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@flowstate/database', '@flowstate/contracts', '@flowstate/github'],
  serverExternalPackages: ['pg', 'yjs'],
  poweredByHeader: false,
  devIndicators: false,
  // Framework development defaults include action arguments and token-bearing URLs.
  logging: { incomingRequests: false, serverFunctions: false, browserToTerminal: false },
};
export default config;
