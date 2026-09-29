import Papa from 'papaparse';

const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[a-z]{2,}$/i;

export interface ParsedLeads {
  emails: string[];
  invalid: number;
  duplicates: number;
}

/**
 * Extract email addresses from a CSV or plain-text file.
 * - CSV with a header: uses the column whose name contains "email" if there is one,
 *   otherwise scans every cell.
 * - Plain text: any comma / semicolon / whitespace separated tokens.
 * Duplicates (case-insensitive) are removed, order is preserved.
 */
export async function parseLeadsFile(file: File): Promise<ParsedLeads> {
  const text = await file.text();
  const { data } = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });

  let cells: string[];
  const header = data[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const emailCol = header.findIndex((h) => h.includes('email'));
  if (emailCol >= 0 && !EMAIL_RE.test(header[emailCol]!)) {
    cells = data.slice(1).map((row) => row[emailCol] ?? '');
  } else {
    cells = data.flat().flatMap((c) => c.split(/[\s;]+/));
  }
  return dedupe(cells);
}

export function parseLeadsText(text: string): ParsedLeads {
  return dedupe(text.split(/[\s,;]+/));
}

function dedupe(raw: string[]): ParsedLeads {
  const seen = new Set<string>();
  const emails: string[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const cell of raw) {
    const v = cell.trim().replace(/^<|>$/g, '').toLowerCase();
    if (!v) continue;
    if (!EMAIL_RE.test(v)) {
      invalid++;
      continue;
    }
    if (seen.has(v)) {
      duplicates++;
      continue;
    }
    seen.add(v);
    emails.push(v);
  }
  return { emails, invalid, duplicates };
}
