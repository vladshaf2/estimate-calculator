import type { JSX, ReactNode } from 'react';
import { useStore } from '../data/store';
import type { Member, Task } from '../data/types';
import { useI18n } from '../i18n';
import { useThemeChoice, type ThemeChoice } from '../lib/theme';
import { isDone, isOverdue } from '../lib/smart';
import { ALMATY, PRAGUE, dayKey, fmtDay, fmtTime } from '../lib/time';

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="seg" role="group" aria-label="Language">
      {(['ru', 'en'] as const).map((l) => (
        <button key={l} type="button" className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

const svg = (d: JSX.Element) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const THEME_ICON: Record<ThemeChoice, JSX.Element> = {
  auto: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" /></>),
  light: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  dark: svg(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />),
};
const THEME_ORDER: ThemeChoice[] = ['auto', 'light', 'dark'];

/** Auto / Light / Dark. `compact` = one icon button that cycles. */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [choice, setChoice] = useThemeChoice();
  if (compact) {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(choice) + 1) % 3];
    return (
      <button type="button" className="icon-btn" data-theme-toggle onClick={() => setChoice(next)}
        title={`${t('set.theme')}: ${t(('theme.' + choice) as 'theme.auto')}`} aria-label={`${t('set.theme')}: ${t(('theme.' + choice) as 'theme.auto')}`}>
        {THEME_ICON[choice]}
      </button>
    );
  }
  return (
    <div className="seg" role="group" aria-label={t('set.theme')}>
      {THEME_ORDER.map((c) => (
        <button key={c} type="button" className={choice === c ? 'on' : ''} onClick={() => setChoice(c)} data-theme-choice={c}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{THEME_ICON[c]}{t(('theme.' + c) as 'theme.auto')}</span>
        </button>
      ))}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />;
}

export function Chip({ color, children, className = '', title }: { color?: string; children: ReactNode; className?: string; title?: string }) {
  return <span className={'chip ' + className} title={title}>{color && <Dot color={color} />}{children}</span>;
}

export function Avatar({ m }: { m: Member | undefined | null }) {
  const { nm } = useI18n();
  if (!m) return null;
  return <span className="avatar" style={{ background: m.color }} title={nm(m)}>{nm(m).slice(0, 1).toUpperCase()}</span>;
}

/** "Prague 18:00 · Almaty 22:00" (adds the day when it differs from Prague). */
export function postTimes(iso: string, lang: string, t: ReturnType<typeof useI18n>['t']): string {
  const pDay = dayKey(iso, PRAGUE), aDay = dayKey(iso, ALMATY);
  const a = fmtTime(iso, ALMATY) + (aDay !== pDay ? ' (' + fmtDay(aDay, lang) + ')' : '');
  return `${t('tz.prague')} ${fmtTime(iso, PRAGUE)} · ${t('tz.almaty')} ${a}`;
}

export function dueText(task: Task, lang: string): string {
  if (!task.due_at) return '';
  const d = fmtDay(dayKey(task.due_at, PRAGUE), lang);
  return task.due_all_day ? d : d + ' ' + fmtTime(task.due_at, PRAGUE);
}

/** Status, types, dates, assignee — the small line under a task title. */
export function TaskMeta({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { db, me } = useStore();
  const { t, nm, lang } = useI18n();
  const status = task.status_id ? db.statuses[task.status_id] : null;
  const project = task.project_id ? db.projects[task.project_id] : null;
  const overdue = isOverdue(task, { db, now: new Date(), meId: me?.id || null });
  const checklistDone = task.checklist.filter((c) => c.done).length;
  return (
    <div className="task-meta">
      {task.priority > 0 && <span className="prio" title={t(('prio.' + task.priority) as 'prio.1')}>{'!'.repeat(task.priority)}</span>}
      {!compact && status && <Chip color={status.color}>{nm(status)}</Chip>}
      {project && <Chip color={project.color}>{project.name}</Chip>}
      {task.work_type_ids.map((id) => db.work_types[id]).filter(Boolean).map((w) => (
        <Chip key={w.id} color={w.color}>{nm(w)}</Chip>
      ))}
      {task.due_at && <Chip className={overdue ? 'red' : ''}>📅 {dueText(task, lang)}</Chip>}
      {task.publish_at && <Chip title={t('detail.publish')}>📣 {task.platform ? task.platform[0].toUpperCase() + task.platform.slice(1) + ' · ' : ''}{fmtDay(dayKey(task.publish_at, PRAGUE), lang)} · {postTimes(task.publish_at, lang, t)}</Chip>}
      {task.checklist.length > 0 && <Chip>☑ {checklistDone}/{task.checklist.length}</Chip>}
      {task.links.length > 0 && <Chip>🔗 {task.links.length}</Chip>}
      {task.assignee_id && <Avatar m={db.members[task.assignee_id]} />}
    </div>
  );
}

export function useIsDone() {
  const { db } = useStore();
  return (task: Task) => isDone(task, db);
}

export function newId(): string {
  return crypto.randomUUID();
}
