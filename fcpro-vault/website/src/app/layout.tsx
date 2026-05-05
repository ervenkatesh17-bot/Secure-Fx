import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FCPro Vault',
  description: 'Secure Final Cut Pro project licensing, delivery, and administration.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
