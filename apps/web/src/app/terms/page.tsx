import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/public-footer';
export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'Usage expectations and software terms for the FLOWSTATE collaboration studio.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms' },
};
export default function Terms() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Link className="brand" href="/about">
          FLOWSTATE
        </Link>
        <Link href="/login">Sign in ↗</Link>
      </header>
      <main className="legal-page">
        <p className="eyebrow">UPDATED 9 NOVEMBER 2026</p>
        <h1>Terms of use.</h1>
        <p>
          FLOWSTATE is a portfolio collaboration application. The instance operator determines who
          may use their instance and is responsible for its deployment. These terms do not promise a
          hosted service, service-level agreement, guaranteed availability or production
          suitability.
        </p>
        <h2>Your account and content</h2>
        <p>
          Keep your credentials secure, use content and repositories you are authorized to access,
          and respect workspace permissions. Your content remains yours. Using collaboration
          features allows the operator and authorized collaborators to process that content to
          provide the requested functionality.
        </p>
        <h2>Responsible use</h2>
        <p>
          Do not attempt unauthorized access, expose another person’s secrets, overload services or
          use code runners to harm systems. Workspace administrators can remove membership. GitHub
          publishing requires the relevant GitHub permissions; review proposed changes before
          publishing. Keep independent backups of important work.
        </p>
        <h2>Public source and dependencies</h2>
        <p>
          The repository is public for inspection. The current FLOWSTATE revision is not offered
          under an open-source license; see the repository’s LICENSE for applicable rights. Earlier
          MIT-licensed revisions and third-party dependencies retain their own terms. Public
          visibility does not transfer ownership of the application.
        </p>
        <h2>Limitations</h2>
        <p>
          The software is supplied as available, without a promise that every document format or
          repository workflow will work without errors. Optional Office services and GitHub,
          storage, monitoring and hosting providers have separate terms. Any legally required
          consumer protections remain subject to applicable law.
        </p>
        <h2>Questions</h2>
        <p>
          Contact the operator who provided this instance for access, support or data requests. See
          the <Link href="/privacy">privacy policy</Link> for data handling details.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
