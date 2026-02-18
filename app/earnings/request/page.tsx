import { EmailRequestClient } from '../../../components/EmailRequestClient';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Oliver JW - Request Earnings Summary',
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickEmailValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

export default async function EarningsRequestPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const params = await searchParams;
  const initialEmail = pickEmailValue(params?.email);

  return (
    <main>
      <EmailRequestClient initialEmail={initialEmail} />
    </main>
  );
}
