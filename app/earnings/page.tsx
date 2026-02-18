import { EarningsClient } from '../../components/EarningsClient';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Oliver JW - Earnings Summarizer',
};

export default function EarningsPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main>
      <h1>Earnings Summarizer</h1>
      <p>
        <em>
          Paste a basket of tickers and get a clean, fast summary of their latest
          earnings.
        </em>
      </p>
      <p>
        Want an email flow with a form UI? Use{' '}
        <a href="/earnings/request">this request form</a>.
      </p>

      <EarningsClient />
    </main>
  );
}
