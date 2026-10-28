// Script files → plain text for parseScript (all in the browser, nothing is uploaded).
// .txt/.md/.fountain as is; .docx (Word, Google Docs export) and .fdx (Final Draft) are converted with headings
// turned into "## …" lines; .pdf via pdf.js (loaded only when needed).

export const SCRIPT_ACCEPT = '.txt,.md,.markdown,.fountain,.text,.docx,.fdx,.pdf';

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** word/document.xml → text: paragraphs separated by blank lines, heading styles become "## ". */
export function docxXmlToText(xml: string): string {
  const out: string[] = [];
  const body = xml.replace(/<w:tab\/>/g, '<w:t>\t</w:t>').replace(/<w:(?:br|cr)\/>/g, '<w:t>\n</w:t>');
  for (const m of body.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const text = decodeXml(Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g), (x) => x[1]).join('')).trim();
    if (!text) continue;
    const style = /<w:pStyle w:val="([^"]*)"/.exec(p)?.[1] || '';
    out.push(/^(heading|title|заголовок|berschrift)/i.test(style) ? '## ' + text : text);
  }
  return out.join('\n\n');
}

/** Final Draft .fdx → text: scene headings become "## ", a character's cue and lines make one block, transitions are dropped. */
export function fdxToText(xml: string): string {
  const paras: string[] = [];
  let dialog: string[] | null = null;
  const flushDialog = () => { if (dialog?.length) paras.push(dialog.join('\n')); dialog = null; };
  for (const m of xml.matchAll(/<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/g)) {
    const type = /Type="([^"]*)"/.exec(m[1])?.[1] || 'Action';
    const text = decodeXml(Array.from(m[2].matchAll(/<Text\b[^>]*>([^<]*)<\/Text>/g), (x) => x[1]).join('')).trim();
    if (!text) continue;
    if (type === 'Character') { flushDialog(); dialog = [text]; }
    else if ((type === 'Dialogue' || type === 'Parenthetical') && dialog) dialog.push(text);
    else if (type === 'Transition') flushDialog();
    else { flushDialog(); paras.push(type === 'Scene Heading' ? '## ' + text : text); }
  }
  flushDialog();
  return paras.join('\n\n');
}

/** Reads one file from a .zip (stored or deflated) with the browser's DecompressionStream. */
export async function readZipEntry(buf: ArrayBuffer, name: string): Promise<string | null> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const fname = dec.decode(new Uint8Array(buf, p + 46, nlen));
    if (fname === name) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = new Uint8Array(buf, start, csize);
      if (method === 0) return dec.decode(data);
      if (method !== 8) throw new Error('unsupported zip compression');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}

async function pdfToText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const paras: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    // Group text runs into lines by their y; a gap bigger than ~1.6 lines starts a new paragraph.
    let line = '', lastY: number | null = null, lastH = 12, para: string[] = [];
    const endLine = () => { if (line.trim()) para.push(line.trim()); line = ''; };
    const endPara = () => { endLine(); if (para.length) paras.push(para.join('\n')); para = []; };
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const y = it.transform[5], h = Math.abs(it.transform[3]) || lastH;
      if (lastY !== null && Math.abs(y - lastY) > h * 0.5) { if (Math.abs(lastY - y) > lastH * 1.6) endPara(); else endLine(); }
      line += it.str;
      if (it.hasEOL) endLine();
      lastY = y; lastH = h;
    }
    endPara();
  }
  return paras.join('\n\n');
}

export async function readScriptFile(file: File): Promise<string> {
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] || '').toLowerCase();
  if (ext === 'docx') {
    const xml = await readZipEntry(await file.arrayBuffer(), 'word/document.xml');
    if (!xml) throw new Error('word/document.xml not found');
    return docxXmlToText(xml);
  }
  if (ext === 'fdx') return fdxToText(await file.text());
  if (ext === 'pdf') return pdfToText(await file.arrayBuffer());
  if (['doc', 'rtf', 'pages', 'odt'].includes(ext)) throw new Error('unsupported');
  return file.text();
}
