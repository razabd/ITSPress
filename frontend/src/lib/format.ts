const FORMAT_LABELS: Record<string, string> = {
  epub:      'EPUB',
  pdf:       'PDF',
  audiobook: 'Audiobook LCP',
  divina:    'Divina',
  lpf:       'LPF',
  webpub:    'Web Publication',
  rpf:       'RPF',
};

export function formatLabel(fmt?: string): string {
  if (!fmt) return '—';
  return FORMAT_LABELS[fmt.toLowerCase()] ?? fmt.toUpperCase();
}

/** Warna badge CSS class berdasarkan format */
export function formatBadgeClass(fmt?: string): string {
  if (!fmt) return 'badge-green';
  switch (fmt.toLowerCase()) {
    case 'epub':      return 'badge-purple';
    case 'audiobook': return 'badge-orange';
    default:          return 'badge-green';
  }
}
