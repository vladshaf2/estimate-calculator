import { describe, expect, it } from 'vitest';
import en from './en.json';
import ru from './ru.json';
import { translate } from './index';

describe('i18n', () => {
  it('every key exists in both languages', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(ru)) expect(v, k).toBeTruthy();
  });
  it('Russian plurals', () => {
    expect(translate('ru', 'count.tasks', { n: 1 })).toBe('1 задача');
    expect(translate('ru', 'count.tasks', { n: 3 })).toBe('3 задачи');
    expect(translate('ru', 'count.tasks', { n: 11 })).toBe('11 задач');
    expect(translate('en', 'count.tasks', { n: 2 })).toBe('2 tasks');
  });
});
