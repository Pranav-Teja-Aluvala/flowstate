import type { Metadata } from 'next';
import './globals.css';
import './studio-theme.css';
import localFont from 'next/font/local';
const manrope = localFont({
  src: '../../../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-ui',
  fallback: ['Arial'],
});
import { FeedbackProvider } from '@/components/forms';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  title: { default: 'FLOWSTATE — Creative collaboration studio', template: '%s · FLOWSTATE' },
  description: 'A collaborative studio for teams, live documents, project boards and shared code.',
  robots: { index: false, follow: false },
  applicationName: 'FLOWSTATE',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
