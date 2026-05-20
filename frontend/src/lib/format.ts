const FORMAT_LABELS: Record<string, string> = {
  epub: 'EPUB',
  pdf:  'PDF',
};

export function formatLabel(fmt?: string): string {
  if (!fmt) return '—';
  return FORMAT_LABELS[fmt.toLowerCase()] ?? fmt.toUpperCase();
}

