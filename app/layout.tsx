import './globals.css';
import './moments.css';
import './question-engine.css';
import './home.css';
import './norda-theme.css';
import './auth-fixes.css';
import './paste.css';
import './peppe-enhancer.css';
import type { Metadata } from 'next';
import Navigation from './navigation';
import PeppeEnhancer from './peppe-enhancer';

export const metadata: Metadata = {
  title: 'Peppe Manager',
  description: 'Performance copilot for athletes and coaches',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <PeppeEnhancer />
        <Navigation />
      </body>
    </html>
  );
}
