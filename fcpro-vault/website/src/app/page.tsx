import Link from 'next/link';

const features = [
  ['Envelope Encryption', 'AES-256-GCM project delivery with locally wrapped data keys and authenticated metadata.', '🔐'],
  ['Two-Device License', 'Keep premium projects portable for real customers while stopping unlimited sharing.', '💻'],
  ['Replay Protection', 'Redis nonce claims, short TTL tokens, and IP-bound license verification sessions.', '⚡'],
  ['Razorpay Webhooks', 'Verified Razorpay events create, suspend, and expire licenses automatically.', '💳'],
  ['Admin Control', 'Operational dashboards for revocation, audit trails, device limits, and verification stats.', '🛡️'],
  ['FCP Desktop App', 'A sandboxed desktop client opens encrypted projects without exposing raw keys to the renderer.', '🎬'],
];

const stats = ['200+ Templates', '2 Devices', 'AES-256', '5 min TTL'];

export default function Home() {
  return (
    <main>
      <nav className="navbar">
        <Link href="/" className="logo">
          <span>FCPro</span> Vault
        </Link>
        <div className="nav-actions">
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/pricing" className="btn btn-amber">
            Get Started
          </Link>
        </div>
      </nav>

      <section className="hero-section">
        <div className="grid-overlay" />
        <div className="hero-content fade-up">
          <p className="eyebrow">Premium Final Cut Pro assets</p>
          <h1>
            Professional FCP Projects.{' '}
            <span className="gradient-text">Secure. Yours.</span>
          </h1>
          <p className="hero-sub">
            FCPro Vault delivers cinematic project templates through encrypted
            downloads, device-bound licenses, and payment-aware access controls.
          </p>
          <div className="hero-actions">
            <Link href="/pricing" className="btn btn-amber">
              Browse Plans
            </Link>
            <Link href="/dashboard" className="btn btn-outline">
              Open Dashboard
            </Link>
          </div>
          <div className="stats-row">
            {stats.map((stat) => (
              <span key={stat}>{stat}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading fade-up">
          <p className="eyebrow">Security by design</p>
          <h2>Everything required to sell premium FCP files with confidence.</h2>
        </div>
        <div className="feature-grid">
          {features.map(([title, description, icon], index) => (
            <article className={`card fade-up-${(index % 3) + 1}`} key={title}>
              <div className="feature-icon">{icon}</div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="cta-panel">
          <p className="eyebrow">Ready for launch</p>
          <h2>Protect your next project pack with FCPro Vault.</h2>
          <p>
            Start with Standard, upgrade when your catalog grows, and manage
            customers from one polished portal.
          </p>
          <Link href="/pricing" className="btn btn-amber">
            See Pricing
          </Link>
        </div>
      </section>

      <footer className="footer">
        <span>FCPro Vault</span>
        <span>Encrypted delivery for professional creators.</span>
      </footer>
    </main>
  );
}
