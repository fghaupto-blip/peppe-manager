import './globals.css';
import './moments.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Peppe Manager',
  description: 'Performance copilot for athletes and coaches',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <nav className="global-nav" aria-label="Navegación principal">
          <Link href="/">Inicio</Link>
          <Link href="/study">Estudio</Link>
          <Link href="/body">Cuerpo</Link>
          <Link href="/settings">Rutina</Link>
        </nav>
      </body>
    </html>
  );
}
