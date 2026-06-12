'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Bold, Italic, Link2, List, ListOrdered, Underline } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
}

function ToolbarButton({
  onClick,
  active,
  children,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-800 hover:shadow-sm',
        active && 'bg-white text-slate-900 shadow-sm',
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your note…',
  className,
  minHeight = 200,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || el.innerHTML === value) return;
    el.innerHTML = value || '';
  }, [value]);

  const exec = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    onChange(editorRef.current?.innerHTML ?? '');
  }, [onChange]);

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML ?? '');
  };

  const addLink = () => {
    const url = window.prompt('Enter URL');
    if (url) exec('createLink', url);
  };

  return (
    <div className={cn('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/80 px-2 py-1.5">
        <ToolbarButton onClick={() => exec('bold')} label="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('italic')} label="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('underline')} label="Underline">
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton onClick={() => exec('insertUnorderedList')} label="Bullet list">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('insertOrderedList')} label="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={addLink} label="Link">
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        onInput={handleInput}
        className={cn(
          'prose prose-sm max-w-none px-4 py-3.5 text-[14px] leading-relaxed text-slate-800 outline-none',
          'empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]',
        )}
        style={{ minHeight }}
        suppressContentEditableWarning
      />
    </div>
  );
}
