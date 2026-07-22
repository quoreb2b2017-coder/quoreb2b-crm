import type { ReactNode } from 'react';

/** Match http(s) URLs and www. links in plain text. */
const URL_RE =
  /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?"')\]}])/gi;

function normalizeHref(raw: string): string {
  const trimmed = raw.replace(/[),.;!?]+$/g, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Turn plain message text into text + clickable link nodes. */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const raw = match[0];
    // Trim trailing punctuation that is usually not part of the URL
    const trailing = raw.match(/[),.;!?]+$/)?.[0] ?? '';
    const urlText = trailing ? raw.slice(0, -trailing.length) : raw;
    if (start > last) {
      nodes.push(text.slice(last, start));
    }
    if (urlText) {
      nodes.push(
        <a
          key={`link-${key++}`}
          href={normalizeHref(urlText)}
          target="_blank"
          rel="noopener noreferrer"
          className="wa-chat__link"
          onClick={(e) => e.stopPropagation()}
        >
          {urlText}
        </a>,
      );
    }
    if (trailing) {
      nodes.push(trailing);
    }
    last = start + raw.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes.length ? nodes : [text];
}
