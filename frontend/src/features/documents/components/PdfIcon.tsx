export function PdfIcon({ name }: { name: string }) {
  const ext = (name.split('.').pop() ?? 'doc').slice(0, 4).toUpperCase();
  return (
    <svg width='32' height='38' viewBox='0 0 32 38' aria-hidden>
      <path d='M4 1h17l10 10v24a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z' fill='#fff' stroke='#c9ccd1' />
      <path d='M21 1v8a2 2 0 0 0 2 2h8' fill='none' stroke='#c9ccd1' />
      <rect x='0' y='18' width='26' height='12' rx='2' fill='#e2362b' />
      <text x='13' y='27' textAnchor='middle' fontSize='8' fontWeight='700' fill='#fff' fontFamily='Arial, sans-serif'>
        {ext}
      </text>
    </svg>
  );
}
