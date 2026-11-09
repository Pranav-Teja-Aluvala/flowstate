'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { moveTask, saveTask } from '@/lib/work-actions';
import { ActionForm } from './forms';
type Task = {
  id: string;
  columnId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  sortKey: number;
  version: number;
};
type Column = { id: string; title: string; sortKey: number };
type Member = { id: string; name: string };
export function Kanban({
  columns,
  tasks,
  members,
  editable,
}: {
  columns: Column[];
  tasks: Task[];
  members: Member[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const move = (task: Task, columnId: string, index: number) =>
    startTransition(async () => {
      const state = await moveTask({ taskId: task.id, columnId, index, version: task.version });
      setFeedback(state.error || state.success || '');
      router.refresh();
    });
  function fields(columnId: string, task?: Task) {
    return (
      <>
        <input type="hidden" name="columnId" value={columnId} />
        {task && (
          <>
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="version" value={task.version} />
          </>
        )}
        <label>
          Task title
          <input name="title" defaultValue={task?.title} required maxLength={200} />
        </label>
        <label>
          Task description
          <textarea name="description" defaultValue={task?.description} maxLength={10000} />
        </label>
        <label>
          Assignee
          <select name="assigneeId" aria-label="Assignee" defaultValue={task?.assigneeId || ''}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  }
  return (
    <section className="kanban-section" aria-label="Task board">
      <div role="status" className="board-feedback">
        {pending ? 'Saving move…' : feedback}
      </div>
      <div className="kanban">
        {columns.map((column) => {
          const items = tasks
            .filter((t) => t.columnId === column.id)
            .sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id));
          return (
            <section
              className="kanban-column"
              key={column.id}
              onDragOver={(e) => {
                if (editable) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const task = tasks.find((t) => t.id === e.dataTransfer.getData('text/plain'));
                if (editable && task) move(task, column.id, items.length);
              }}
              aria-label={`${column.title} column`}
            >
              <header>
                <h3>
                  {column.title} <span>{items.length}</span>
                </h3>
                {editable && (
                  <button
                    className="icon-button"
                    aria-label={`Add task to ${column.title}`}
                    onClick={() => setAdding(adding === column.id ? null : column.id)}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </header>
              {items.map((task, index) => (
                <article
                  className="task-card"
                  key={task.id}
                  draggable={editable && !pending}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', task.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (editable) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const moving = tasks.find((t) => t.id === e.dataTransfer.getData('text/plain'));
                    if (editable && moving) move(moving, column.id, index);
                  }}
                >
                  <div className="task-title">
                    {editable && <GripVertical size={13} />}
                    <button
                      disabled={!editable}
                      onClick={() => setEditing(editing === task.id ? null : task.id)}
                    >
                      {task.title}
                    </button>
                  </div>
                  {task.description && <p>{task.description}</p>}
                  {task.assigneeId && (
                    <span className="task-assignee">
                      {members.find((m) => m.id === task.assigneeId)?.name || 'Former member'}
                    </span>
                  )}
                  {editable && (
                    <div className="task-move">
                      <select
                        aria-label={`Move ${task.title}`}
                        value={column.id}
                        disabled={pending}
                        onChange={(e) =>
                          move(
                            task,
                            e.target.value,
                            tasks.filter((t) => t.columnId === e.target.value).length,
                          )
                        }
                      >
                        {columns.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={pending || index === 0}
                        className="icon-button"
                        aria-label={`Move ${task.title} up`}
                        onClick={() => move(task, column.id, index - 1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        disabled={pending || index === items.length - 1}
                        className="icon-button"
                        aria-label={`Move ${task.title} down`}
                        onClick={() => move(task, column.id, index + 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  )}
                  {editing === task.id && (
                    <ActionForm action={saveTask} label="Save task" key={task.version}>
                      {fields(column.id, task)}
                    </ActionForm>
                  )}
                </article>
              ))}
              {adding === column.id && (
                <div className="task-card">
                  <ActionForm action={saveTask} label="Create task">
                    {fields(column.id)}
                  </ActionForm>
                  <button className="back-link" onClick={() => setAdding(null)}>
                    Done adding tasks
                  </button>
                </div>
              )}
              {!items.length && adding !== column.id && (
                <p className="column-empty">A little space for what’s next.</p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
