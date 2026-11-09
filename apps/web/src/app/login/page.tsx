import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, Layers2 } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { authenticate } from '@/lib/actions';
import { ActionForm } from '@/components/forms';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  if (await currentUser()) redirect('/app');
  const register = (await searchParams).mode === 'register';
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link href="/login" className="brand">
          <Layers2 size={25} />
          FLOWSTATE
          <span className="brand-dot" />
        </Link>
        <div className="auth-copy">
          <p className="eyebrow">A SHARED SPACE. A CLEARER MIND.</p>
          <h1>
            Good work
            <br />
            happens
            <br />
            <em>together.</em>
          </h1>
          <p>Bring your people, projects, and ideas into the same flow.</p>
        </div>
        <div className="auth-foot">
          <span>Less friction. More forward.</span>
          <ArrowUpRight size={22} />
        </div>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h2>{register ? 'Make room for good work.' : 'Welcome back.'}</h2>
          <p className="muted">
            {register
              ? 'Create an account, then a space for your team.'
              : 'Pick up where your team left off.'}
          </p>
          <ActionForm action={authenticate} label={register ? 'Create account' : 'Sign in'}>
            <input type="hidden" name="mode" value={register ? 'register' : 'login'} />
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@yourteam.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                required
                minLength={12}
                maxLength={72}
                placeholder="At least 12 characters"
              />
            </label>
          </ActionForm>
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to FLOWSTATE?'}{' '}
            <Link href={register ? '/login' : '/login?mode=register'}>
              {register ? 'Sign in' : 'Create an account'} <ArrowUpRight size={13} />
            </Link>
          </p>
          <p className="auth-note">
            A focused home for the work that matters.
            <br />
            <Link href="/about">About</Link> · <Link href="/privacy">Privacy policy</Link> ·{' '}
            <Link href="/terms">Terms of use</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
