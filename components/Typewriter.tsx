'use client';

import { useEffect, useRef } from 'react';

export function Typewriter({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;

    heading.textContent = '';
    let index = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const typeNextChar = () => {
      if (!heading) return;
      if (index < text.length) {
        heading.textContent += text.charAt(index);
        index += 1;
        timeoutId = setTimeout(typeNextChar, 100);
      }
    };

    timeoutId = setTimeout(typeNextChar, 300);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [text]);

  return <h1 ref={headingRef} className={className} data-text={text} />;
}
