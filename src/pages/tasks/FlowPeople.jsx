import { useState } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Display';
import { Dropdown } from '@/components/ui/Dropdown';

/** The people of a flow task, in order (drag to reorder). The first receives the task; when they close their step it goes to the next. */
export function FlowPeople({ value, onChange, users, allowedIds }) {
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState(null);
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? 'Someone';
  const last = value[value.length - 1];
  // a person may come back later in the flow, but not twice in a row
  const options = users.filter((u) => u.id !== last && (!allowedIds || allowedIds.includes(u.id))).map((u) => ({ value: u.id, label: u.name }));
  const drop = (to) => {
    if (from === null || from === to) return;
    const next = [...value];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  return (
    <div className="fp">
      <div className="fp-label">Who works on it, in order</div>
      <ol className="fp-list">
        {value.map((id, i) => (
          <li
            key={`${id}-${i}`}
            className={from === i ? 'fp-chip is-drag' : 'fp-chip'}
            draggable
            onDragStart={() => setFrom(i)}
            onDragEnd={() => setFrom(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { drop(i); setFrom(null); }}
          >
            <GripVertical className="fp-grip" />
            <span className="fp-no">{i + 1}</span>
            <Avatar name={nameOf(id)} />
            <b>{nameOf(id)}</b>
            <button type="button" className="fp-x" aria-label={`Remove ${nameOf(id)}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><X /></button>
          </li>
        ))}
        <li>
          <button type="button" className="fp-add" onClick={() => setAdding(!adding)}><Plus /> Add person</button>
        </li>
      </ol>
      {adding && (
        <div className="fp-pick">
          <Dropdown search placeholder="Choose a person…" options={options} value={null} onChange={(v) => { if (v) { onChange([...value, v]); setAdding(false); } }} />
        </div>
      )}
      {allowedIds && <p className="muted small fp-note">Only people on the project can be added. Drag to change the order.</p>}
    </div>
  );
}
