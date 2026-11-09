import Link from 'next/link';
import { Layers2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { acceptInvite } from '@/lib/actions';
import { ActionForm } from '@/components/forms';
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser();
  const { token } = await params;
  return (
    <main className="join-page">
      <Link className="brand" href="/">
        <Layers2 />
        FLOWSTATE
      </Link>
      <section className="setup-card">
        <p className="eyebrow">GOOD WORK IS A TEAM SPORT</p>
        <h1>You’re invited.</h1>
        <p className="muted">
          Signed in as {user.email}. The invitation must match this email address.
        </p>
        <ActionForm action={acceptInvite} label="Join workspace">
          <input type="hidden" name="token" value={token} />
        </ActionForm>
        <Link className="back-link" href="/">
          Back to your workspaces
        </Link>
      </section>
    </main>
  );
}
