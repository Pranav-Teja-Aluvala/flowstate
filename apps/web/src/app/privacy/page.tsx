import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/public-footer';
export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How a FLOWSTATE instance handles account information, team content, connected services and privacy requests.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy' },
};
export default function Privacy() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
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
        <h1>Privacy policy.</h1>
        <p>
          This policy describes the data handling built into FLOWSTATE. The person or organization
          operating the instance you use controls its infrastructure, access, backups and any
          additional services. The public source repository does not publish your workspace content.
        </p>
        <h2>Information stored</h2>
        <p>
          Accounts store your name, email address and a password hash. FLOWSTATE stores session
          records, workspace memberships, invitations, projects, tasks, notes, comments, review
          suggestions, documents, code buffers and uploaded files. File history keeps previous saved
          versions. Activity records identify the member who performed a workspace action.
        </p>
        <h2>Why it is used and who can see it</h2>
        <p>
          This information supports sign-in, access control, collaboration, file recovery and
          activity history. Authorized workspace members can see content within their role. Owners
          and admins manage membership and review suggestions. Instance operators can access stored
          data and infrastructure logs; this build does not provide end-to-end encryption.
        </p>
        <h2>Cookies and presence</h2>
        <p>
          An HTTP-only session cookie keeps you signed in. Signed short-lived tickets authorize
          document connections and file access. Workspace presence sends authenticated heartbeats
          while the page is visible; the online display expires after 35 seconds without a
          heartbeat. No advertising cookies or advertising analytics are built in.
        </p>
        <h2>Connected services</h2>
        <p>
          When enabled, GitHub receives authorization and repository requests; access tokens are
          encrypted in the database. An Office document server processes files you open or convert
          and can retain its own cache. Supabase may store files if the operator selects it.
          Optional Sentry reporting sends filtered error stack locations; application code disables
          user details, request bodies, replay, traces and log delivery. Hosting and connected
          services have their own policies and may process connection metadata such as IP addresses.
        </p>
        <h2>Retention and deletion</h2>
        <p>
          Content remains until deleted through supported project controls or removed by the
          operator. Previous file versions are deliberately retained for recovery and count toward
          the project quota. Expired sessions stop granting access, but expiry does not itself
          guarantee immediate database deletion. Backups, Office caches and infrastructure logs
          follow the operator’s retention schedule. Account export and account erasure are
          operator-assisted in this release.
        </p>
        <h2>Your requests</h2>
        <p>
          You can download shared files and saved historical versions, export documents, disconnect
          GitHub, or ask the operator to correct, export or delete your account data. Requests may
          require identity verification. Rights and response requirements depend on the laws that
          apply to the operator and your location.
        </p>
        <h2>Contact and changes</h2>
        <p>
          {contact ? (
            <>
              Contact the instance operator at <a href={`mailto:${contact}`}>{contact}</a>.
            </>
          ) : (
            'Contact the person who provided access to this instance. Public deployments must publish their operator identity and privacy contact before collecting user data.'
          )}{' '}
          Material changes should be reflected here with an updated date. This notice describes this
          build; it is not a certification of legal compliance.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
