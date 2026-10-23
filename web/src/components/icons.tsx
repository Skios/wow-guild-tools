// Action icons drawn from Lucide (https://lucide.dev, ISC licence), inlined: two icons don't need the package.
const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const PencilIcon = () => (
  <svg {...svg}>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </svg>
);

export const XIcon = () => (
  <svg {...svg}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
