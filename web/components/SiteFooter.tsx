import Link from "next/link";
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap cols">
        <div>
          <h2>SenseAtlas</h2>
          <p className="small">An accessible STEM learning prototype. AI-generated descriptions are always checked and approved by a teacher before students see them.</p>
        </div>
        <div>
          <h2>Keyboard basics</h2>
          <ul className="small">
            <li><kbd>Tab</kbd> moves to the next control</li>
            <li><kbd>←</kbd> <kbd>→</kbd> switch explorer tabs</li>
            <li><kbd>↑</kbd> <kbd>↓</kbd> move through structures</li>
          </ul>
        </div>
        <div>
          <h2>Pages</h2>
          <ul className="small">
            <li><Link href="/">Home</Link></li>
            <li><Link href="/login">Sign in</Link></li>
            <li><Link href="/register">Create an account</Link></li>
            <li><Link href="/settings">Accessibility settings</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
