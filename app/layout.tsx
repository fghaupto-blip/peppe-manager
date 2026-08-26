import './globals.css';
import './moments.css';
import './question-engine.css';
import './home.css';
import './norda-theme.css';
import type { Metadata } from 'next';
import Navigation from './navigation';

export const metadata: Metadata = {
  title: 'Peppe Manager',
  description: 'Performance copilot for athletes and coaches',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <Navigation />
      </body>
    </html>
  );
}
