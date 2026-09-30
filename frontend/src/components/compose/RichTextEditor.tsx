import {
  AlignCenter,
  AlignLeft,
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

type Cmd = { icon: LucideIcon; label: string; run: () => void } | 'sep';

const exec = (command: string, arg?: string) => document.execCommand(command, false, arg);

const tools: Cmd[] = [
  { icon: Undo2, label: 'Undo', run: () => exec('undo') },
  { icon: Redo2, label: 'Redo', run: () => exec('redo') },
  'sep',
  { icon: Bold, label: 'Bold', run: () => exec('bold') },
  { icon: Italic, label: 'Italic', run: () => exec('italic') },
  { icon: Underline, label: 'Underline', run: () => exec('underline') },
  { icon: Strikethrough, label: 'Strikethrough', run: () => exec('strikeThrough') },
  'sep',
  { icon: AlignLeft, label: 'Align left', run: () => exec('justifyLeft') },
  { icon: AlignCenter, label: 'Align center', run: () => exec('justifyCenter') },
  { icon: List, label: 'Bulleted list', run: () => exec('insertUnorderedList') },
  { icon: ListOrdered, label: 'Numbered list', run: () => exec('insertOrderedList') },
  { icon: Quote, label: 'Quote', run: () => exec('formatBlock', 'blockquote') },
  {
    icon: Link,
    label: 'Insert link',
    run: () => {
      const url = prompt('Link URL');
      if (url) exec('createLink', url);
    },
  },
];

/**
 * Lightweight rich-text body editor (contentEditable + toolbar), no heavy editor
 * dependency. Emits HTML which is sent as the email's html part.
 */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Only push external value into the DOM when it differs (e.g. form reset),
  // otherwise the caret would jump on every keystroke.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML === '<br>' ? '' : (ref.current?.innerHTML ?? ''));

  return (
    <div className="rounded-2xl border border-line bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        data-placeholder="Type Your Reply..."
        onInput={emit}
        className="prose-email min-h-64 px-5 pt-4 text-sm leading-relaxed outline-none"
      />
      <div className="flex flex-wrap items-center gap-0.5 border-t border-line px-3 py-2">
        {tools.map((t, i) =>
          t === 'sep' ? (
            <span key={i} className="mx-1 h-4 w-px bg-line" />
          ) : (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              onMouseDown={(e) => e.preventDefault()} // keep selection in the editor
              onClick={() => {
                t.run();
                emit();
              }}
              className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
            >
              <t.icon className="size-4" />
            </button>
          ),
        )}
      </div>
    </div>
  );
}
