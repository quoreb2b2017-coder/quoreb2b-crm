import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'src');

const replacements = [
  ['#217346', '#2e7ad1'],
  ['#1a5c38', '#2568b8'],
  ['#248f54', '#3a85d8'],
  ['#1d6b42', '#2568b8'],
  ['#1a6b42', '#2568b8'],
  ['#2d8f5c', '#3a85d8'],
  ['bg-emerald-600', 'bg-[#2e7ad1]'],
  ['hover:bg-emerald-700', 'hover:bg-[#2568b8]'],
  ['text-emerald-700', 'text-[#2e7ad1]'],
  ['text-emerald-800', 'text-[#2568b8]'],
  ['text-emerald-600', 'text-[#2e7ad1]'],
  ['border-emerald-600', 'border-[#2e7ad1]'],
  ['ring-emerald-500', 'ring-[#2e7ad1]'],
  ['bg-violet-600', 'bg-[#2e7ad1]'],
  ['hover:bg-violet-700', 'hover:bg-[#2568b8]'],
  ['text-violet-600', 'text-[#2e7ad1]'],
  ['text-violet-800', 'text-[#2568b8]'],
  ['bg-indigo-600', 'bg-[#2e7ad1]'],
  ['hover:bg-indigo-700', 'hover:bg-[#2568b8]'],
  ['text-indigo-600', 'text-[#2e7ad1]'],
];

function shouldSkip(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  return rel.startsWith('components/auth/');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(tsx?|css)$/.test(entry.name) && !shouldSkip(full)) files.push(full);
  }
  return files;
}

let changed = 0;
for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8');
  const original = text;
  for (const [from, to] of replacements) {
    text = text.split(from).join(to);
  }
  if (text !== original) {
    fs.writeFileSync(file, text);
    changed++;
  }
}
console.log(`Updated ${changed} files`);
