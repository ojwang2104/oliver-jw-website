import './globals.css';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { SiteNav } from '../components/SiteNav';
import { SiteFooter } from '../components/SiteFooter';
import { BottomBar } from '../components/BottomBar';

export const metadata = {
  title: 'Oliver JW',
  description: 'Personal site of Oliver JW',
};

const themeInitScript = `
(function() {
  var saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body>
        <SiteNav />
        {children}
        <SiteFooter />
        <BottomBar />
        <Script src="/theme.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
