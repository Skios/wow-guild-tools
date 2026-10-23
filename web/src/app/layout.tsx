import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { App } from '../App';
import { THEME_BOOT_SCRIPT } from '../themes';
import '../styles.css';

export const metadata: Metadata = { title: 'Guild Raid Admin' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script sets data-theme/data-icons on <html> before it hydrates, hence suppressHydrationWarning.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <App>{children}</App>
      </body>
    </html>
  );
}
