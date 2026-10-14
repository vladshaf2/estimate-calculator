import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { useI18n, type TKey } from '../i18n';
import { NO_FILTERS, activeFilterCount, type Filters } from '../lib/smart';
import { Dot } from './bits';
import { useUi } from './Shell';

type Key = keyof Filters;

export function FilterBar() {
  const { db } = useStore();
  const { t, nm } = useI18n();
  const { filters, setFilters, view, showDone, setShowDone } = useUi();
  const [open, setOpen] = useState<Key | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const options: Record<Key, { id: string; label: string; color: string }[]> = {
    statuses: Object.values(db.statuses).sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, label: nm(s), color: s.color })),
    types: Object.values(db.work_types).sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, label: nm(s), color: s.color })),
    assignees: Object.values(db.members).map((m) => ({ id: m.id, label: nm(m), color: m.color })),
    workspaces: Object.values(db.workspaces).sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, label: nm(s), color: s.color })),
    projects: Object.values(db.projects).filter((p) => !p.archived).map((p) => ({ id: p.id, label: p.name, color: p.color })),
  };
  const labels: Record<Key, TKey> = { statuses: 'filters.status', types: 'filters.type', assignees: 'filters.assignee', workspaces: 'filters.workspace', projects: 'filters.project' };

  const toggle = (k: Key, id: string) => {
    const cur = filters[k];
    setFilters({ ...filters, [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  return (
    <div className="filters" ref={ref}>
      {(Object.keys(labels) as Key[]).map((k) => (
        <div className="pop-wrap" key={k}>
          <button className={'chip toggle' + (filters[k].length ? ' on' : '')} onClick={() => setOpen(open === k ? null : k)} data-filter={k}>
            {t(labels[k])}{filters[k].length ? ' · ' + filters[k].length : ''} ▾
          </button>
          {open === k && (
            <div className="pop">
              {options[k].map((o) => (
                <label key={o.id}>
                  <input type="checkbox" checked={filters[k].includes(o.id)} onChange={() => toggle(k, o.id)} />
                  <Dot color={o.color} /> {o.label}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      {activeFilterCount(filters) > 0 && <button className="btn ghost sm" onClick={() => setFilters(NO_FILTERS)}>{t('filters.clear')}</button>}
      {view === 'list' && (
        <label className="show-done"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> {t('list.showDone')}</label>
      )}
    </div>
  );
}
