import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@flowstate/database', '@flowstate/contracts', '@flowstate/github'],
  serverExternalPackages: ['pg', 'yjs', 'exceljs', 'docx', 'pptxgenjs'],
  poweredByHeader: false,
  devIndicators: false,
  redirects: () => [
    {
      source: '/',
      has: [{ type: 'query', key: 'new', value: '1' }],
      destination: '/app?new=1',
      permanent: false,
    },
  ],
  // Framework development defaults include action arguments and token-bearing URLs.
  logging: { incomingRequests: false, serverFunctions: false, browserToTerminal: false },
};
export default config;
