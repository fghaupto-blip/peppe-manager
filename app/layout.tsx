import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Peppe Manager',
  description: 'Performance copilot for athletes and coaches',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
