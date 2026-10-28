import { describe, expect, it } from 'vitest';
import { parseScript } from './script';
import { decodeXml, docxXmlToText, fdxToText, readZipEntry } from './scriptFile';

/** Minimal zip writer for the test (one deflated entry), built with web APIs. */
async function zip(name: string, content: string): Promise<ArrayBuffer> {
  const stream = new Blob([content]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const data = new Uint8Array(await new Response(stream).arrayBuffer());
  const nm = new TextEncoder().encode(name);
  const buf = new ArrayBuffer(30 + nm.length + data.length + 46 + nm.length + 22);
  const v = new DataView(buf), u = new Uint8Array(buf);
  v.setUint32(0, 0x04034b50, true); v.setUint16(8, 8, true); v.setUint32(18, data.length, true); v.setUint16(26, nm.length, true);
  u.set(nm, 30); u.set(data, 30 + nm.length);
  const cd = 30 + nm.length + data.length;
  v.setUint32(cd, 0x02014b50, true); v.setUint16(cd + 10, 8, true); v.setUint32(cd + 20, data.length, true); v.setUint16(cd + 28, nm.length, true); v.setUint32(cd + 42, 0, true);
  u.set(nm, cd + 46);
  const end = cd + 46 + nm.length;
  v.setUint32(end, 0x06054b50, true); v.setUint16(end + 8, 1, true); v.setUint16(end + 10, 1, true); v.setUint32(end + 12, 46 + nm.length, true); v.setUint32(end + 16, cd, true);
  return buf;
}

const DOCX = '<w:document><w:body>'
  + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Сцена 1. Расстрел</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t xml:space="preserve">Туман над </w:t></w:r><w:r><w:t>рекой &amp; лес.</w:t></w:r></w:p>'
  + '<w:p/><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Нефть</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>Вышка</w:t><w:br/><w:t>на закате</w:t></w:r></w:p></w:body></w:document>';

describe('script files', () => {
  it('decodes XML entities', () => {
    expect(decodeXml('a &amp; b &lt;c&gt; &#1046; &#x41; &quot;')).toBe('a & b <c> Ж A "');
  });
  it('docx paragraphs and heading styles', () => {
    expect(docxXmlToText(DOCX)).toBe('## Сцена 1. Расстрел\n\nТуман над рекой & лес.\n\n## Нефть\n\nВышка\nна закате');
    expect(parseScript(docxXmlToText(DOCX))).toEqual([
      { title: 'Расстрел', blocks: ['Туман над рекой & лес.'] },
      { title: 'Нефть', blocks: ['Вышка\nна закате'] },
    ]);
  });
  it('reads a deflated entry from a zip', async () => {
    expect(await readZipEntry(await zip('word/document.xml', DOCX), 'word/document.xml')).toBe(DOCX);
    expect(await readZipEntry(await zip('a.txt', 'x'), 'word/document.xml')).toBeNull();
    await expect(readZipEntry(new ArrayBuffer(8), 'x')).rejects.toThrow();
  });
  it('final draft: headings, dialogue blocks, no transitions', () => {
    const fdx = `<?xml version="1.0"?><FinalDraft><Content>
      <Paragraph Type="Scene Heading"><Text>INT. KITCHEN - NIGHT</Text></Paragraph>
      <Paragraph Type="Action"><Text>She opens the </Text><Text Style="Bold">fridge</Text><Text>.</Text></Paragraph>
      <Paragraph Type="Character"><Text>ANNA</Text></Paragraph>
      <Paragraph Type="Parenthetical"><Text>(quietly)</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>Empty again.</Text></Paragraph>
      <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
      <Paragraph Type="Scene Heading"><Text>EXT. ROOF - DAWN</Text></Paragraph>
      <Paragraph Type="Action"><Text>Wind.</Text></Paragraph>
    </Content></FinalDraft>`;
    expect(parseScript(fdxToText(fdx))).toEqual([
      { title: 'INT. KITCHEN - NIGHT', blocks: ['She opens the fridge.', 'ANNA\n(quietly)\nEmpty again.'] },
      { title: 'EXT. ROOF - DAWN', blocks: ['Wind.'] },
    ]);
  });
});
