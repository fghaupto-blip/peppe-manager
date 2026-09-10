import './peppe-layout-fix.css';

export default function PeppeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="peppe-route">{children}</div>;
}
