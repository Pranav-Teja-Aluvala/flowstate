import Link from 'next/link';
import type { Metadata } from 'next';
import { Layers2, ArrowUpRight } from 'lucide-react';
import { PublicFooter } from '@/components/public-footer';
export const metadata: Metadata = {
  title: 'A studio for work in motion',
  description:
    'FLOWSTATE brings teams, project boards, live documents and shared code into one collaborative studio.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'FLOWSTATE — Work in motion',
    description: 'Plan, write, review and build together.',
    type: 'website',
    url: '/about',
  },
};
export default function About() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Link className="brand" href="/about">
          <Layers2 size={24} />
          FLOWSTATE
          <span className="brand-dot" />
        </Link>
        <Link className="button secondary" href="/login">
          Sign in <ArrowUpRight size={16} />
        </Link>
      </header>
      <main>
        <section className="public-hero">
          <p className="eyebrow">A CREATIVE COLLABORATION STUDIO</p>
          <h1>
            Different minds.
            <br />
            <em>Shared momentum.</em>
          </h1>
          <p>Give your team a place to plan the work, shape the idea, and build it together.</p>
          <Link className="button primary" href="/login?mode=register">
            Create your workspace <ArrowUpRight size={16} />
          </Link>
          <Link className="public-source" href="https://github.com/Pranav-Teja-Aluvala/flowstate">
            Explore the project on GitHub ↗
          </Link>
        </section>
        <section className="public-features" aria-label="Studio features">
          <article>
            <span className="eyebrow">01 / PLAN</span>
            <h2>Make the next move clear.</h2>
            <p>
              Create projects, assign tasks, set priorities and share team notes. Keep decisions
              beside the work.
            </p>
          </article>
          <article>
            <span className="eyebrow">02 / CREATE</span>
            <h2>Think on the same page.</h2>
            <p>
              Write together with live cursors and saved document state. Open Office files with the
              optional editing service, export PDFs and restore saved file versions.
            </p>
          </article>
          <article>
            <span className="eyebrow">03 / BUILD</span>
            <h2>Bring the code into the conversation.</h2>
            <p>
              Connect an authorized GitHub repository, edit shared files, discuss changes and review
              suggestions before publishing a pull request.
            </p>
          </article>
        </section>
        <section className="public-note">
          <h2>Your team. Your workspace.</h2>
          <p>
            Membership roles control access to projects and documents. GitHub access, Office editing
            and isolated terminals need their configured services. This portfolio build does not
            include a hosted service subscription.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
