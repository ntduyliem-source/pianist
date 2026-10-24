import type React from 'react';

export function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
      </>
    ),
    moon: <path d="M20.5 13.5A9 9 0 0 1 10.5 3 9 9 0 1 0 20.5 13.5Z" />,
    stop: <rect x="5" y="5" width="14" height="14" rx="1" />,
    listen: (
      <>
        <path d="M4 14v-3a8 8 0 0 1 16 0v3" />
        <rect x="3" y="12" width="4" height="8" rx="2" />
        <rect x="17" y="12" width="4" height="8" rx="2" />
      </>
    ),
    score: (
      <>
        <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />
      </>
    ),
    piano: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7.5 5v14M12 5v14M16.5 5v14" />
        <path d="M7.5 5v8M12 5v8M16.5 5v8" strokeWidth="3" />
      </>
    ),
    folder: <path d="M3 7h7l2-3h8v16H3z" />,
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2" />
      </>
    ),
    add: <path d="M12 4v16M4 12h16" />,
    upload: (
      <>
        <path d="M12 16V3M7 8l5-5 5 5M4 15v6h16v-6" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8z" />,
    pause: <path d="M8 4v16M16 4v16" strokeWidth="4" />,
    save: (
      <>
        <path d="M4 3h14l3 3v15H3V3zM7 3v7h10V3M7 21v-7h10v7" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7M3 12h13" />,
    back: <path d="m12 5-7 7 7 7M5 12h16" />,
    check: <path d="m4 12 5 5L20 5" />,
    download: (
      <>
        <path d="M12 3v13M7 11l5 5 5-5M4 17v4h16v-4" />
      </>
    ),
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.score}
    </svg>
  );
}
