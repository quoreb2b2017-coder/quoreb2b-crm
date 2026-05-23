import Link from 'next/link';
import { LayoutDashboard, Linkedin } from 'lucide-react';

const legalLinks = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Cookie Policy', href: '/cookies' },
  { label: 'Support', href: 'mailto:support@quoreb2b.com' },
];

const socialLinks = [
  {
    label: 'QuoreB2B on LinkedIn',
    href: 'https://www.linkedin.com/company/quoreb2b',
    icon: Linkedin,
  },
];

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="min-w-0 max-w-md lg:max-w-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900"
            >
              <LayoutDashboard className="h-4 w-4 shrink-0 text-slate-600" />
              QuoreB2B CRM
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Enterprise B2B customer relationship management for your organization.
            </p>
          </div>

          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10 lg:gap-12">
            <nav aria-label="Legal and support" className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                Legal
              </h3>
              <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                {legalLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="whitespace-nowrap text-sm text-slate-600 transition-colors hover:text-brand-600"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div
              className="flex items-center gap-3 border-t border-slate-200 pt-6 sm:border-l sm:border-t-0 sm:pl-10 sm:pt-0"
              aria-label="Social media"
            >
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
