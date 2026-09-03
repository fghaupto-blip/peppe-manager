import './globals.css';
import './moments.css';
import './question-engine.css';
import './home.css';
import './norda-theme.css';
import './auth-fixes.css';
import './paste.css';
import './peppe-enhancer.css';
import './peppe-weather.css';
import './responsive-nav.css';
import './norda-layout-v2.css';
import './peppe-dashboard-v3.css';
import type { Metadata } from 'next';
import Navigation from './navigation';
import PeppeEnhancerV2 from './peppe-enhancer-v2';
import PeppeWeather from './peppe-weather';

export const metadata: Metadata = {
  title: 'Peppe Manager',
  description: 'Performance copilot for athletes and coaches',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <PeppeEnhancerV2 />
        <PeppeWeather />
        <Navigation />
      </body>
    </html>
  );
}
