import type { Metadata } from 'next';
import { Landing } from '@/components/landing';
export const metadata: Metadata = {
  title: 'Your team’s next great thing starts here',
  description:
    'Plan projects, write shared documents, create spreadsheets and presentations, and review code together in FLOWSTATE.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    title: 'FLOWSTATE — A little more together',
    description: 'Your projects, documents and code. One thoughtful workspace.',
    url: '/',
    type: 'website',
  },
};
export default function Home() {
  return <Landing signedIn={false} />;
}
