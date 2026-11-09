import Link from 'next/link';
import {
  Layers2,
  ArrowUpRight,
  ArrowRight,
  Check,
  FileText,
  Table2,
  Presentation,
  GitBranch,
  MessageSquare,
  Plus,
  GripVertical,
  ChevronRight,
  Circle,
} from 'lucide-react';
import { PublicFooter } from './public-footer';
export function Landing({ signedIn }: { signedIn: boolean }) {
  const start = signedIn ? '/app' : '/login?mode=register';
  return (
    <div className="landing">
      <header className="landing-header">
        <Link className="brand" href="/">
          <Layers2 size={26} />
          flowstate
          <span className="brand-dot" />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#features">What’s inside</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div>
          {!signedIn && (
            <Link className="landing-signin" href="/login">
              Sign in
            </Link>
          )}
          <Link className="button primary" href={start}>
            {signedIn ? 'Open workspace' : 'Get started'}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">
              <span /> A LITTLE MORE TOGETHER
            </span>
            <h1>
              Good ideas deserve
              <br />a <em>shared space.</em>
            </h1>
            <p>
              Bring your projects, documents, and code together. Less jumping between tabs. More
              making things happen.
            </p>
            <div className="hero-actions">
              <Link className="button primary" href={start}>
                {signedIn ? 'Go to your workspace' : 'Create your workspace'}
                <ArrowRight size={17} />
              </Link>
              <a href="#how-it-works" className="button secondary">
                Take a look
              </a>
            </div>
            <p className="hero-footnote">Built for teams who think, write, and build together.</p>
          </div>
          <div className="landing-preview" aria-label="Illustrative workspace preview">
            <div className="preview-bar">
              <span className="preview-dots">
                <i />
                <i />
                <i />
              </span>
              <span>Studio launch / Project board</span>
              <Layers2 size={16} />
            </div>
            <div className="preview-content">
              <aside>
                <strong>
                  <Layers2 size={17} /> Northstar
                </strong>
                <span className="preview-selected">↗ Project board</span>
                <span>
                  <FileText size={14} /> Documents
                </span>
                <span>
                  <GitBranch size={14} /> Code & review
                </span>
                <small>WORKSPACE PREVIEW</small>
              </aside>
              <div className="preview-board">
                <div className="preview-heading">
                  <div>
                    <small>THE NEXT CHAPTER</small>
                    <h2>Studio launch</h2>
                  </div>
                  <span className="preview-plus">
                    <Plus size={17} />
                  </span>
                </div>
                <div className="preview-columns">
                  <div>
                    <h3>
                      <Circle size={9} /> To do <span>2</span>
                    </h3>
                    <article>
                      <span className="preview-tag">DESIGN</span>
                      <p>Explore the new direction</p>
                      <footer>
                        <span className="preview-person">A</span> Alex <MessageSquare size={12} />
                      </footer>
                    </article>
                    <article>
                      <span className="preview-tag neutral">PLANNING</span>
                      <p>Map out the first release</p>
                      <footer>
                        <span className="preview-person coral">S</span> Sam
                      </footer>
                    </article>
                  </div>
                  <div>
                    <h3>
                      <Circle size={9} /> In progress <span>1</span>
                    </h3>
                    <article>
                      <span className="preview-tag green">DOCUMENT</span>
                      <p>Write the launch brief</p>
                      <div className="preview-mini-doc">
                        <span />
                        <span />
                        <span />
                      </div>
                      <footer>
                        <span className="preview-person coral">S</span> Sam <Check size={13} />
                      </footer>
                    </article>
                  </div>
                </div>
                <div className="preview-note">
                  <FileText size={16} />
                  <div>
                    <strong>The launch brief</strong>
                    <span>A shared direction for what comes next.</span>
                  </div>
                  <ChevronRight size={17} />
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="landing-strip" aria-label="Ways to work">
          <span>ONE PLACE TO</span>
          <strong>
            <Layers2 size={17} /> Plan the work
          </strong>
          <strong>
            <FileText size={17} /> Shape the idea
          </strong>
          <strong>
            <GitBranch size={17} /> Build together
          </strong>
        </section>
        <section className="landing-features" id="features">
          <div className="landing-section-heading">
            <p className="eyebrow">ROOM FOR THE WHOLE PROJECT</p>
            <h2>
              From the first thought
              <br />
              to the <em>finished thing.</em>
            </h2>
            <p>Your team’s work has more than one shape. Give every part a place.</p>
          </div>
          <div className="feature-pair">
            <article className="feature-project">
              <div className="feature-icon">
                <Layers2 size={22} />
              </div>
              <h3>A plan everyone can follow.</h3>
              <p>
                Create project boards, assign tasks, and keep the next step clear. Share notes where
                your team will find them.
              </p>
              <div className="feature-task">
                <GripVertical size={14} />
                <span>Make the next step clear</span>
                <span className="feature-status">
                  <Check size={12} /> In progress
                </span>
              </div>
            </article>
            <article className="feature-documents">
              <div className="feature-icon">
                <FileText size={22} />
              </div>
              <h3>Make more than a to-do list.</h3>
              <p>
                Write together. Build a spreadsheet. Shape a presentation. Create the documents your
                project needs and export them when you’re ready.
              </p>
              <div className="format-preview">
                <span>
                  <b>W</b> Word
                </span>
                <span>
                  <Table2 size={19} /> Excel
                </span>
                <span>
                  <Presentation size={19} /> Slides
                </span>
                <span>
                  <b>PDF</b> PDF
                </span>
              </div>
            </article>
          </div>
        </section>
        <section className="landing-code">
          <div>
            <p className="eyebrow">A CONVERSATION AROUND THE CODE</p>
            <h2>
              Think it through.
              <br />
              <em>Then ship it.</em>
            </h2>
            <p>
              Connect a public repository, edit shared files, and leave a suggestion your team can
              review. GitHub-authorized publishing is available when the GitHub App is configured.
            </p>
            <Link className="text-link" href={start}>
              Bring your team together <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="landing-diff" aria-label="Illustrative code review">
            <header>
              <span>
                <GitBranch size={15} /> src/welcome.ts
              </span>
              <span>Suggested change</span>
            </header>
            <code>
              <span className="diff-context">export function welcome(team) {'{'}</span>
              <span className="diff-minus">{"−  return 'Hello';"}</span>
              <span className="diff-plus">
                + return `Welcome, ${'{'}team{'}'}!`;
              </span>
              <span className="diff-context">{'}'}</span>
            </code>
            <footer>
              <MessageSquare size={16} />
              <span>“A warmer welcome for the whole team.”</span>
              <span className="review-label">Ready for review</span>
            </footer>
          </div>
        </section>
        <section className="landing-how" id="how-it-works">
          <div className="landing-section-heading">
            <p className="eyebrow">LESS SETUP. MORE MOMENTUM.</p>
            <h2>
              Make a little room
              <br />
              for <em>better work.</em>
            </h2>
          </div>
          <ol>
            <li>
              <span>01</span>
              <h3>Create your space.</h3>
              <p>Start a workspace and invite the people you work with.</p>
            </li>
            <li>
              <span>02</span>
              <h3>Bring the project in.</h3>
              <p>Add a board, create a document, or connect a public repository.</p>
            </li>
            <li>
              <span>03</span>
              <h3>Move it forward, together.</h3>
              <p>Share the work, review changes, and export what you’ve made.</p>
            </li>
          </ol>
        </section>
        <section className="landing-cta">
          <div>
            <p className="eyebrow">YOUR NEXT CHAPTER</p>
            <h2>
              Start something <em>together.</em>
            </h2>
          </div>
          <Link className="button primary" href={start}>
            {signedIn ? 'Open your workspace' : 'Get started with FLOWSTATE'}
            <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
