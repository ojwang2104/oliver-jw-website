import Link from 'next/link';

export function SiteNav() {
  return (
    <nav>
      <Link href="/">About</Link>
      <Link href="/projects">Projects</Link>
      <div className="dropdown">
        <Link href="/writings">Writings</Link>
        <div className="dropdown-content">
          <Link href="/book-reviews">Book Reviews</Link>
        </div>
      </div>
      <div className="dropdown">
        <Link href="/reading-2026">What I&apos;m Reading</Link>
        <div className="dropdown-content">
          <Link href="/reading-2026">2026</Link>
          <Link href="/reading-2025">2025</Link>
        </div>
      </div>
      <Link href="/media">Media</Link>
      <button className="theme-toggle" aria-label="Toggle dark mode">
        &#9790;
      </button>
    </nav>
  );
}
