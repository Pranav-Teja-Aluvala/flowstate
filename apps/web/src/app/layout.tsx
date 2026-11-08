import type { Metadata } from 'next';
import './globals.css';
import { FeedbackProvider } from '@/components/forms';
export const metadata: Metadata = {
  title: { default: 'FLOWSTATE — A little more in sync', template: '%s · FLOWSTATE' },
  description: 'A focused workspace for collaborative documents, projects, and task boards.',
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
