export const metadata = {
  title: 'Oliver JW - Projects',
};

export default function ProjectsPage() {
  return (
    <main>
      <h1>Projects</h1>
      <div className="project-subtabs">
        <a className="project-subtab active" href="/projects">
          Overview
        </a>
        <a className="project-subtab" href="/projects/earnings-tracker">
          Earnings Tracker
        </a>
      </div>

      <article>
        <h2>Earnings Tracker</h2>
        <p>
          AI-assisted earnings tracker that finds press releases/transcripts and sends summary emails.
        </p>
        <p>
          <a href="/projects/earnings-tracker">Open the app</a>
        </p>
      </article>
    </main>
  );
}
