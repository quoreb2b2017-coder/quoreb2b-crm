import Link from 'next/link';
import { MapPin } from 'lucide-react';

const legalLinks = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Cookie Policy', href: '/cookies' },
];

const productLinks = [
  { label: 'Sign in', href: '#sign-in' },
  { label: 'Super Admin', href: '#sign-in' },
  { label: 'Employee Portal', href: '#sign-in' },
];

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="public-hub__footer">
      <div className="public-hub__footer-shell">
        <div className="public-hub__footer-grid">
          <div className="public-hub__footer-brand">
            <p className="public-hub__footer-tagline">
              Enterprise B2B CRM for sales teams, database administrators, and operations — secure,
              role-based, and built to scale.
            </p>
          </div>

          <div className="public-hub__footer-col">
            <p className="public-hub__footer-heading">Product</p>
            <ul className="public-hub__footer-list">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="public-hub__footer-link">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="public-hub__footer-col">
            <p className="public-hub__footer-heading">Legal</p>
            <ul className="public-hub__footer-list">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="public-hub__footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="public-hub__footer-col">
            <p className="public-hub__footer-heading">Contact</p>
            <ul className="public-hub__footer-list">
              <li>
                <a href="mailto:support@quoreb2b.com" className="public-hub__footer-link">
                  support@quoreb2b.com
                </a>
              </li>
              <li>
                <span className="public-hub__footer-link public-hub__footer-link--muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  Pune, Maharashtra, India
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="public-hub__footer-bar">
          <p className="public-hub__footer-copy">© {year} Quore Group · QuoreB2B CRM</p>
          <p className="public-hub__footer-note">Authorized personnel only · All access is monitored</p>
        </div>
      </div>
    </footer>
  );
}
