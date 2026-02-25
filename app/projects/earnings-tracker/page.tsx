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
        Enter your ticker basket and email, then summarize and subscribe in one step. You will start
        receiving automated earnings updates and get a welcome email with the tickers you added.
      </p>

      <EarningsClient />
    </main>
  );
}
