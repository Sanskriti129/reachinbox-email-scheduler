import { Upload, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useToast } from '../../hooks/useToast';
import { parseLeadsFile, parseLeadsText } from '../../lib/parseLeads';

const VISIBLE_CHIPS = 3;

/**
 * "To" row from the Figma: chips for addresses, "+N" overflow, and "Upload List"
 * which parses a CSV / text file of leads and shows how many addresses were detected.
 */
export function RecipientsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [fileInfo, setFileInfo] = useState<string | null>(null);

  const merge = (incoming: string[]) => {
    const set = new Set(value);
    const added = incoming.filter((e) => !set.has(e));
    onChange([...value, ...added]);
    return added.length;
  };

  const commitDraft = () => {
    if (!draft.trim()) return;
    const { emails, invalid } = parseLeadsText(draft);
    merge(emails);
    if (invalid) toast(`${invalid} invalid address(es) ignored`, 'error');
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ' ', 'Tab'].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const { emails, invalid, duplicates } = await parseLeadsFile(file);
      const added = merge(emails);
      const parts = [`${emails.length} email${emails.length === 1 ? '' : 's'} detected in ${file.name}`];
      if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} removed`);
      if (invalid) parts.push(`${invalid} invalid skipped`);
      setFileInfo(parts.join(' · '));
      toast(`Added ${added} lead${added === 1 ? '' : 's'} from ${file.name}`, added ? 'success' : 'info');
    } catch {
      toast('Could not read that file', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const shown = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - shown.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700"
          >
            {email}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => onChange(value.filter((v) => v !== email))}
              className="text-brand-700/60 hover:text-brand-700"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted hover:bg-line"
          >
            +{hidden}
          </button>
        )}
        {expanded && value.length > VISIBLE_CHIPS && (
          <button type="button" onClick={() => setExpanded(false)} className="text-xs text-muted underline">
            show less
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commitDraft}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault();
              merge(parseLeadsText(text).emails);
            }
          }}
          placeholder={value.length ? '' : 'recipient@example.com'}
          aria-label="Recipients"
          className="min-w-40 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-faint"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <Upload className="size-4" /> Upload List
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {(fileInfo || value.length > 0) && (
        <p className="mt-1 text-xs text-muted">
          <span className="font-medium text-ink">{value.length}</span> recipient{value.length === 1 ? '' : 's'}
          {fileInfo && <> · {fileInfo}</>}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange([]);
                setFileInfo(null);
              }}
              className="ml-2 text-faint underline hover:text-ink"
            >
              clear
            </button>
          )}
        </p>
      )}
    </div>
  );
}
