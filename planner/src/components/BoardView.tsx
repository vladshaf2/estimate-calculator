import { DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { useI18n } from '../i18n';
import { visibleTasks } from '../lib/smart';
import { TaskMeta } from './bits';
import { useUi } from './Shell';

const NONE = '__none__';

function Card({ task, overlay = false }: { task: Task; overlay?: boolean }) {
  const { openTask } = useUi();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: overlay });
  return (
    <div ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : listeners)} {...(overlay ? {} : attributes)}
      className={'card' + (isDragging ? ' dragging' : '') + (overlay ? ' drag-overlay' : '')} onClick={() => !overlay && openTask(task.id)} data-card={task.id}>
      <div className="card-title">{task.title}</div>
      <TaskMeta task={task} compact />
    </div>
  );
}

function Column({ id, title, color, tasks }: { id: string; title: string; color: string; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={'col' + (isOver ? ' over' : '')} data-col={id}>
      <div className="col-h"><span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />{title}<span className="n">{tasks.length}</span></div>
      {tasks.map((x) => <Card key={x.id} task={x} />)}
    </div>
  );
}

export function BoardView() {
  const { db, me, update } = useStore();
  const { t, nm } = useI18n();
  const { list, filters, search } = useUi();
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const tasks = visibleTasks({ db, now: new Date(), meId: me?.id || null }, list, filters, search, true);
  const statuses = Object.values(db.statuses).sort((a, b) => a.position - b.position);
  const noStatus = tasks.filter((x) => !x.status_id || !db.statuses[x.status_id]);

  const onStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setDragId(null);
    const to = e.over?.id ? String(e.over.id) : null;
    const task = db.tasks[String(e.active.id)];
    if (!to || !task) return;
    const statusId = to === NONE ? null : to;
    if (task.status_id !== statusId) update('tasks', task.id, { status_id: statusId });
  };

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragId(null)}>
      <div className="board">
        {statuses.map((s) => <Column key={s.id} id={s.id} title={nm(s)} color={s.color} tasks={tasks.filter((x) => x.status_id === s.id)} />)}
        {noStatus.length > 0 && <Column id={NONE} title={t('board.noStatus')} color="#5c5c66" tasks={noStatus} />}
      </div>
      <DragOverlay>{dragId && db.tasks[dragId] ? <Card task={db.tasks[dragId]} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
