const PATHS: Record<string, string> = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  camera: 'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 0v9m0 0 8-4.5M12 12l-8-4.5',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  play: 'M7 4v16l13-8L7 4Z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  first: 'M18 18 10 12l8-6v12ZM6 6v12',
  prev: 'M16 18 8 12l8-6v12Z',
  next: 'm8 18 8-6-8-6v12Z',
  last: 'm6 18 8-6-8-6v12ZM18 6v12',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
  close: 'M18 6 6 18M6 6l12 12',
  wand: 'm15 4 5 5L9 20H4v-5L15 4ZM13 6l5 5',
  check: 'M20 6 9 17l-5-5',
  brush: 'M9.06 11.9 17 4a2.1 2.1 0 1 1 3 3l-7.9 7.94M7 14a3 3 0 0 0-3 3c0 1.3-1 2-2 2 1 1.5 2.7 2 4 2a4 4 0 0 0 4-4 3 3 0 0 0-3-3Z',
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
