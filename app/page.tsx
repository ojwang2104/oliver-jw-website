import { Typewriter } from '../components/Typewriter';

export const metadata = {
  title: 'Oliver JW - About',
};

export default function HomePage() {
  return (
    <main>
      <Typewriter text="Hi, I'm Oliver" className="typewriter" />
      <p>Welcome to my corner of the internet. This is where I share my projects and writings.</p>
      <p>
        <em>
          Currently @{' '}
          <a href="https://www.evenuplaw.com/" target="_blank" rel="noreferrer">
            EvenUp
          </a>
          . Previously @{' '}
          <a href="https://www.insightpartners.com/" target="_blank" rel="noreferrer">
            Insight Partners
          </a>
          , @{' '}
          <a href="https://www.pjtpartners.com/" target="_blank" rel="noreferrer">
            PJT
          </a>
          , Columbia. Just a kid from Toronto.
        </em>
      </p>
      <p>
        You can reach me directly on{' '}
        <a href="https://x.com/wangwang96" target="_blank" rel="noreferrer">
          twitter
        </a>{' '}
        or{' '}
        <a
          href="https://mail.google.com/mail/?view=cm&fs=1&to=olivejwca@gmail.com"
          target="_blank"
          rel="noreferrer"
        >
          email
        </a>
        .
      </p>
    </main>
  );
}
