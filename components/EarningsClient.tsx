'use client';

import { useEffect, useState } from 'react';

type EarningsResult = {
  ticker: string;
  companyName: string | null;
  quarterLabel: string | null;
  pressReleaseFilingDate: string | null;
  pressReleaseUrl: string | null;
  pressReleaseIsPrevious: boolean;
};

export function EarningsClient() {
  const [tickers, setTickers] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [results, setResults] = useState<EarningsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data?.tickers) setTickers(data.tickers);
        if (data?.recipientEmail) setRecipientEmail(data.recipientEmail);
      } catch {
        // Ignore initial settings load failures.
      }
    };
    loadSettings();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setLoading(true);
    setResults([]);

    try {
      const [summaryRes, settingsRes] = await Promise.all([
        fetch('/api/earnings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers }),
        }),
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers, recipientEmail }),
        }),
      ]);

      const [summaryData, settingsData] = await Promise.all([
        summaryRes.json().catch(() => ({})),
        settingsRes.json().catch(() => ({})),
      ]);

      if (!summaryRes.ok) {
        setStatus(summaryData?.error ?? 'Unable to summarize right now.');
        return;
      }
      if (!settingsRes.ok) {
        setStatus(settingsData?.error ?? 'Unable to save your subscription settings.');
        return;
      }

      setTickers(settingsData.tickers ?? tickers);
      setRecipientEmail(settingsData.recipientEmail ?? recipientEmail);
      setResults(summaryData.results ?? []);

      const immediateEmailRes = await fetch('/api/reply/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: settingsData.recipientEmail ?? recipientEmail,
          tickers: settingsData.tickers ?? tickers,
        }),
      });
      const immediateEmailData = await immediateEmailRes.json().catch(() => ({}));

      const immediateEmailStatus =
        immediateEmailRes.ok && !immediateEmailData?.deduped
          ? 'Summary email sent now.'
          : immediateEmailRes.ok && immediateEmailData?.deduped
            ? 'A recent summary request already exists; email may be suppressed.'
            : 'Immediate summary email failed.';
      const welcomeStatus = settingsData?.welcomeEmailSent
        ? 'Welcome email sent.'
        : settingsData?.welcomeEmailSent === false
          ? 'Subscription saved. Welcome email could not be sent.'
          : 'Subscription saved.';
      setStatus(`Saved and automation started. ${welcomeStatus} ${immediateEmailStatus}`);
    } catch {
      setStatus('Unable to complete request right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="earnings-ui">
      <section className="earnings-settings">
        <h2 className="earnings-section-title">Track Earnings</h2>
        <form className="earnings-form" onSubmit={handleSubmit}>
          <label className="earnings-label" htmlFor="tickers">
            Tickers
          </label>
          <input
            id="tickers"
            name="tickers"
            className="earnings-input"
            placeholder="AAPL, MSFT, NVDA"
            value={tickers}
            onChange={(event) => setTickers(event.target.value)}
          />

          <label className="earnings-label" htmlFor="recipientEmail">
            Email
          </label>
          <input
            id="recipientEmail"
            name="recipientEmail"
            className="earnings-input"
            placeholder="you@domain.com"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
          />

          <button className="earnings-button" type="submit" disabled={loading}>
            {loading ? 'Summarizing...' : 'Summarize'}
          </button>
          <p className="earnings-hint">
            Enter tickers individually or comma-separated. Example: <code>AAPL, MSFT, NVDA</code>
          </p>
          {status ? <p className="request-status">{status}</p> : null}
        </form>
      </section>

      <section className="earnings-results" aria-live="polite">
        {results.map((result) => (
          <article key={result.ticker} className="earnings-card">
            <h2 className="earnings-card-title">
              {result.ticker}
              {result.companyName ? ` — ${result.companyName}` : ''}
            </h2>
            <p className="earnings-meta">
              {result.quarterLabel ? `${result.quarterLabel}` : 'Quarter unknown'}
              {result.pressReleaseFilingDate
                ? ` • Filed ${result.pressReleaseFilingDate}`
                : ''}
            </p>
            {result.pressReleaseIsPrevious ? (
              <p className="earnings-previous">
                Showing the most recent prior earnings press release.
              </p>
            ) : null}
            <div className="earnings-links">
              {result.pressReleaseUrl ? (
                <a href={result.pressReleaseUrl} target="_blank" rel="noreferrer">
                  Latest press release
                </a>
              ) : (
                <span>Press release unavailable</span>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
