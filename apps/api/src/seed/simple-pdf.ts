/**
 * A minimal, valid one-or-more-page PDF of plain text (Helvetica, A4), for FAKE demo policies (S-022). No library:
 * the PDF is written by hand with a correct cross-reference table, so PDF readers and Claude can open it.
 */
export function simplePdf(title: string, paragraphs: string[]): Buffer {
  const wrap = (text: string, width: number) => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > width) {
        lines.push(line);
        line = word;
      } else line = (line + ' ' + word).trim();
    }
    if (line) lines.push(line);
    return lines;
  };
  // Latin-1 only in a Type1 font: swap curly quotes and dashes, drop anything else outside it.
  const clean = (s: string) =>
    s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e£]/g, '').replace(/([\\()])/g, '\\$1');

  const all: { text: string; size: number }[] = [{ text: title, size: 16 }, { text: '', size: 11 }];
  for (const p of paragraphs) {
    for (const l of wrap(p, 90)) all.push({ text: l, size: 11 });
    all.push({ text: '', size: 11 });
  }
  const perPage = 48;
  const pages: (typeof all)[] = [];
  for (let i = 0; i < all.length; i += perPage) pages.push(all.slice(i, i + perPage));

  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const page of pages) {
    let y = 800;
    const ops = page
      .map((l) => {
        const op = `BT /F1 ${l.size} Tf 50 ${y} Td (${clean(l.text)}) Tj ET`;
        y -= l.size === 16 ? 24 : 15;
        return op;
      })
      .join('\n');
    const stream = Buffer.from(ops, 'latin1');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
