import { describe, expect, it } from 'vitest';
import { parseScript } from './script';

describe('parseScript', () => {
  it('splits by "Сцена N" headings and paragraphs', () => {
    const r = parseScript('Сцена 1. Расстрел князя Михаила\n\nТуман над рекой.\nСолдаты выводят князя.\n\nКрупно: лицо князя.\n\nСЦЕНА 2: Нефть\n\nБуровая вышка.');
    expect(r).toEqual([
      { title: 'Расстрел князя Михаила', blocks: ['Туман над рекой.\nСолдаты выводят князя.', 'Крупно: лицо князя.'] },
      { title: 'Нефть', blocks: ['Буровая вышка.'] },
    ]);
  });
  it('every line is a block when there are no blank lines', () => {
    expect(parseScript('Scene 1: Rooftop\nWide shot\nClose-up\nScene 2\nTrain')).toEqual([
      { title: 'Rooftop', blocks: ['Wide shot', 'Close-up'] },
      { title: 'Scene 2', blocks: ['Train'] },
    ]);
  });
  it('understands sluglines in both languages', () => {
    const r = parseScript('INT. KITCHEN – NIGHT\nShe opens the fridge.\nИНТ. КУХНЯ — НОЧЬ\nОна открывает холодильник.');
    expect(r.map((s) => s.title)).toEqual(['INT. KITCHEN – NIGHT', 'ИНТ. КУХНЯ — НОЧЬ']);
  });
  it('short numbered lines are headings, numbered sentences are not', () => {
    const r = parseScript('1. Нефть\nВышка на закате\n2. Погоня\n3. Он бежит к поезду, оглядываясь.');
    expect(r).toEqual([
      { title: 'Нефть', blocks: ['Вышка на закате'] },
      { title: 'Погоня', blocks: ['3. Он бежит к поезду, оглядываясь.'] },
    ]);
  });
  it('text without headings becomes one untitled scene', () => {
    expect(parseScript('Shot one\n\nShot two\n')).toEqual([{ title: '', blocks: ['Shot one', 'Shot two'] }]);
  });
  it('markdown headings and CRLF', () => {
    expect(parseScript('## **Сцена 3** — Финал\r\nКонец.')).toEqual([{ title: 'Финал', blocks: ['Конец.'] }]);
  });
  it('empty input', () => {
    expect(parseScript('  \n\n ')).toEqual([]);
  });
});
