'use client';

import { useState } from 'react';

type Props = {
  initialEmail: string;
};

export function EmailRequestClient({ initialEmail }: Props) {
  const [recipientEmail, setRecipientEmail] = useState(initialEmail);
  const [tickers, setTickers] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/reply/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail, tickers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data?.error ?? 'Unable to submit request.');
        return;
      }
      if (data?.deduped) {
        setStatus('Already requested recently. Please wait a few minutes before resubmitting.');
        return;
      }
      setStatus('Request sent. Check your inbox in about 10-60 seconds.');
      setTickers('');
    } catch {
      setStatus('Unable to submit request right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="request-shell">
      <h1>Earnings Summary Request</h1>
      <p>
        Enter your email and ticker basket. We will email you the latest earnings summary.
      </p>

      <form className="request-form" onSubmit={handleSubmit}>
        <label className="earnings-label" htmlFor="requestEmail">
          Email
        </label>
        <input
          id="requestEmail"
          className="earnings-input"
          placeholder="you@domain.com"
          value={recipientEmail}
          onChange={(event) => setRecipientEmail(event.target.value)}
        />

        <label className="earnings-label" htmlFor="requestTickers">
          Tickers
        </label>
        <input
          id="requestTickers"
          className="earnings-input"
          placeholder="AAPL, MSFT, NVDA"
          value={tickers}
          onChange={(event) => setTickers(event.target.value)}
        />

        <button className="earnings-button" disabled={loading} type="submit">
          {loading ? 'Sending...' : 'Email My Summary'}
        </button>
      </form>

      <p className="earnings-hint">
        Tip: use comma-separated tickers. Example: <code>AAPL, MSFT, NVDA</code>
      </p>
      {status ? <p className="request-status">{status}</p> : null}
    </section>
  );
}
