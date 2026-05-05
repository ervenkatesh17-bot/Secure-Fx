import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FCPro Vault',
  description: 'License enforcement and delivery infrastructure for desktop software teams.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
