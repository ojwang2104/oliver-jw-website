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
  const [results, setResults] = useState<EarningsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);

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
    setLoading(true);
    setResults([]);

    try {
      const res = await fetch('/api/earnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoading(false);
        return;
      }
      setResults(data.results ?? []);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSettingsStatus('Saving...');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, recipientEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettingsStatus(data?.error ?? 'Unable to save settings.');
        return;
      }
      setTickers(data.tickers ?? tickers);
      setRecipientEmail(data.recipientEmail ?? recipientEmail);
      setSettingsStatus('Saved.');
    } catch {
      setSettingsStatus('Unable to save settings.');
    }
  };

  return (
    <div className="earnings-ui">
      <section className="earnings-settings">
        <h2 className="earnings-section-title">Alert settings</h2>
        <form className="earnings-form" onSubmit={handleSaveSettings}>
          <label className="earnings-label" htmlFor="recipientEmail">
            Recipient email
          </label>
          <input
            id="recipientEmail"
            name="recipientEmail"
            className="earnings-input"
            placeholder="you@domain.com"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
          />
          <label className="earnings-label" htmlFor="tickers">
            Ticker basket
          </label>
          <input
            id="tickers"
            name="tickers"
            className="earnings-input"
            placeholder="AAPL, MSFT, NVDA"
            value={tickers}
            onChange={(event) => setTickers(event.target.value)}
          />
          <button className="earnings-button" type="submit">
            Save settings
          </button>
          {settingsStatus ? (
            <p className="earnings-hint">{settingsStatus}</p>
          ) : (
            <p className="earnings-hint">Used by hourly email alerts.</p>
          )}
        </form>
      </section>

      <section className="earnings-settings">
        <h2 className="earnings-section-title">Try it now</h2>
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
        <button className="earnings-button" type="submit" disabled={loading}>
          {loading ? 'Summarizing...' : 'Summarize'}
        </button>
        <p className="earnings-hint">Example: AAPL, MSFT, NVDA</p>
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
