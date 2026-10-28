// Pasted screenplay → scenes and blocks.
// A scene starts at a markdown heading ("## Rooftop") or a heading line: "Сцена 3", "СЦЕНА 3. Нефть", "Scene 2: Rooftop", "3. Нефть" (numbered, short),
// or a slugline ("INT. KITCHEN – NIGHT", "ИНТ. КУХНЯ — НОЧЬ", "НАТ.", "EXT.", "ИНТ/НАТ."). Blocks inside a scene are
// paragraphs (split by blank lines); when the text has no blank lines at all, every line is a block.

export interface ParsedScene { title: string; blocks: string[] }

const SCENE_WORD = /^(?:сцена|scene|эпизод|episode|sc\.?)\s*(\d+[a-zа-я]?)\s*[.:—–-]?\s*(.*)$/i;
const SLUG = /^(?:int|ext|i\/e|int\/ext|инт|нат|инт\/нат|нат\/инт)\.?(?:\s|$)/i;
const NUMBERED = /^(\d{1,3})[.)]\s+(.{1,80})$/;

function headingTitle(line: string): string | null {
  const md = /^#{1,6}\s/.test(line.trim());
  const t = line.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
  let m = SCENE_WORD.exec(t);
  if (m) return m[2].trim() || t;
  // Markdown headings (also what .docx headings and Final Draft scene headings are converted to).
  if (md) return t;
  if (SLUG.test(t)) return t;
  m = NUMBERED.exec(t);
  // "3. Нефть" is a heading only when short and without sentence punctuation.
  if (m && !/[.!?…]$/.test(m[2]) && m[2].split(/\s+/).length <= 8) return m[2].trim();
  return null;
}

export function parseScript(text: string): ParsedScene[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const paragraphMode = lines.some((l, i) => !l.trim() && i > 0 && i < lines.length - 1);
  const scenes: ParsedScene[] = [];
  let cur: ParsedScene | null = null;
  let para: string[] = [];
  const flush = () => {
    const p = para.join('\n').trim();
    para = [];
    if (!p) return;
    if (!cur) { cur = { title: '', blocks: [] }; scenes.push(cur); }
    cur.blocks.push(p);
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const title = line.trim() ? headingTitle(line) : null;
    if (title !== null) {
      flush();
      cur = { title, blocks: [] };
      scenes.push(cur);
    } else if (!line.trim()) flush();
    else if (paragraphMode) para.push(line.trim());
    else { para.push(line.trim()); flush(); }
  }
  flush();
  return scenes.filter((s) => s.title || s.blocks.length);
}
