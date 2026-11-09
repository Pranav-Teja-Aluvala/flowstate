import type { Metadata } from 'next';
import './globals.css';
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
    <html lang="en">
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
