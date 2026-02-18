import { EarningsClient } from '../../../components/EarningsClient';

export const metadata = {
  title: 'Oliver JW - Projects - Earnings Tracker',
};

export default function EarningsTrackerProjectPage() {
  return (
    <main>
      <h1>Projects</h1>
      <div className="project-subtabs">
        <a className="project-subtab" href="/projects">
          Overview
        </a>
        <a className="project-subtab active" href="/projects/earnings-tracker">
          Earnings Tracker
        </a>
      </div>

      <h2>Earnings Tracker</h2>
      <p>
        Pull the latest earnings press release, detect quarter/fiscal period, and run a summary workflow.
      </p>

      <EarningsClient />
    </main>
  );
}
