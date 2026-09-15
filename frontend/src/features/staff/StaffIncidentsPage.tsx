import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const BG   = '#06090f';
const BG2  = '#0c1420';
const TEAL = '#00c9b1';
const AMBER = '#ffb930';

interface IncidentRow {
  id: number;
  monday_item_id: string;
  incident_type: string;
  location: string;
  handled: boolean;
  found_on_monday: boolean;
  owner: { email: string; full_name: string } | null;
  patient_name: string;
  patient_age: string;
  patient_gender: string;
  patient_phone: string;
  filer_info: string;
}

interface Task {
  id: number;
  assignee: 'user' | 'staff';
  title: string;
  description: string | null;
  status: 'pending' | 'done';
  sort_order: number;
}

function TaskRow({ task, incidentId, canManage, onChanged, onDeleted }: {
  task: Task; incidentId: number; canManage: boolean;
  onChanged: (t: Task) => void; onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);

  const toggleStatus = useCallback(async () => {
    setBusy(true);
    try {
      const nextStatus = task.status === 'done' ? 'pending' : 'done';
      const res = await fetch(`/api/staff/incidents/${incidentId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (json.success) onChanged(json.task);
    } finally { setBusy(false); }
  }, [task, incidentId]);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/incidents/${incidentId}/tasks/${task.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(task.id);
    } finally { setBusy(false); }
  }, [task, incidentId]);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        onClick={toggleStatus} disabled={busy}
        style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 2,
          border: `1px solid ${task.status === 'done' ? TEAL : 'rgba(255,255,255,0.2)'}`,
          background: task.status === 'done' ? `${TEAL}22` : 'transparent',
          color: TEAL, fontSize: 11, cursor: 'pointer',
        }}
      >
        {task.status === 'done' ? '✓' : ''}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 12, color: task.status === 'done' ? 'rgba(255,255,255,0.35)' : '#e2e8f0',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
        }}>
          {task.title}
          <span style={{ marginLeft: 8, fontSize: 9, color: task.assignee === 'user' ? AMBER : TEAL, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {task.assignee}
          </span>
        </div>
        {task.description && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{task.description}</div>}
      </div>
      {canManage && (
        <button onClick={remove} disabled={busy} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 12,
        }}>✕</button>
      )}
    </div>
  );
}

function TaskManager({ incident, canManage }: { incident: IncidentRow; canManage: boolean }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assignee, setAssignee] = useState<'user' | 'staff'>('staff');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/staff/incidents/${incident.id}/tasks`)
      .then(r => r.json())
      .then(j => { if (j.success) setTasks(j.tasks); });
  }, [incident.id]);

  if (tasks === null) { load(); return <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Loading tasks…</div>; }

  const addTask = async () => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/staff/incidents/${incident.id}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee, title: title.trim(), description: description.trim() || undefined, sort_order: tasks.length }),
      });
      const json = await res.json();
      if (json.success) { setTasks([...tasks, json.task]); setTitle(''); setDescription(''); }
    } finally { setAdding(false); }
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,201,177,0.12)' }}>
      {tasks.length === 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>No tasks yet.</div>}
      {tasks.map(t => (
        <TaskRow
          key={t.id} task={t} incidentId={incident.id} canManage={canManage}
          onChanged={updated => setTasks(tasks.map(x => x.id === updated.id ? updated : x))}
          onDeleted={id => setTasks(tasks.filter(x => x.id !== id))}
        />
      ))}

      {canManage && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <select value={assignee} onChange={e => setAssignee(e.target.value as 'user' | 'staff')} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
            color: '#e2e8f0', fontFamily: MONO, fontSize: 11, padding: '6px 8px',
          }}>
            <option value="staff">Staff</option>
            <option value="user">User</option>
          </select>
          <input
            value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title"
            style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontFamily: MONO, fontSize: 11, padding: '6px 8px' }}
          />
          <input
            value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
            style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontFamily: MONO, fontSize: 11, padding: '6px 8px' }}
          />
          <button onClick={addTask} disabled={adding || !title.trim()} style={{
            background: TEAL, color: BG, border: 'none', borderRadius: 6, fontFamily: MONO, fontSize: 10,
            fontWeight: 700, padding: '6px 14px', cursor: 'pointer', opacity: adding || !title.trim() ? 0.5 : 1,
          }}>+ Add</button>
        </div>
      )}
      {!canManage && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
          Volunteers can mark tasks done — only admins can add, edit, or remove tasks.
        </div>
      )}
    </div>
  );
}

function IncidentRowCard({ incident, canManage, expanded, onToggle }: {
  incident: IncidentRow; canManage: boolean; expanded: boolean; onToggle: () => void;
}) {
  return (
    <div style={{ background: BG2, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={onToggle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
            {incident.incident_type || '(no type)'} — {incident.location || '(no location)'}
          </div>
          <div style={{ fontSize: 10, color: `${TEAL}88`, marginTop: 3 }}>
            {incident.owner ? `${incident.owner.full_name} · ${incident.owner.email}` : 'no owner'}
            {!incident.found_on_monday && ' · ⚠ not found on Monday'}
          </div>
          {(incident.patient_name || incident.filer_info) && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>
              {incident.patient_name && `Patient: ${incident.patient_name}${incident.patient_age ? `, ${incident.patient_age}` : ''}${incident.patient_gender ? `, ${incident.patient_gender}` : ''}${incident.patient_phone ? ` · ${incident.patient_phone}` : ''}`}
              {incident.patient_name && incident.filer_info && '  ·  '}
              {incident.filer_info && `Filed by: ${incident.filer_info}`}
            </div>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && <TaskManager incident={incident} canManage={canManage} />}
    </div>
  );
}

export default function StaffIncidentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [incidents, setIncidents] = useState<IncidentRow[] | null>(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const isAdmin     = user?.roles.includes('admin') ?? false;
  const isVolunteer = user?.roles.includes('volunteer') ?? false;
  const hasAccess   = isAdmin || isVolunteer;

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1rem' }}>◈ Staff Console</div>
          <p style={{ fontSize: 13, marginBottom: '1.25rem' }}>Log in with your staff account to continue.</p>
          <Link to="/login?next=/staff/incidents" style={{
            display: 'inline-block', padding: '0.75rem 1.5rem', background: TEAL, color: BG,
            borderRadius: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, textDecoration: 'none',
          }}>Log In →</Link>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(255,77,106,0.2)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 13 }}>Your account doesn&apos;t have staff access.</p>
          <Link to="/account" style={{ fontSize: 11, color: TEAL }}>← Back to My Account</Link>
        </div>
      </div>
    );
  }

  if (incidents === null) {
    fetch('/api/staff/incidents')
      .then(r => {
        if (r.status === 403) { setError('Forbidden'); return null; }
        return r.json();
      })
      .then(j => { if (j?.success) setIncidents(j.incidents); else if (j) setError('Failed to load.'); })
      .catch(() => setError('Network error.'));
  }

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: `${BG}ee`, backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,201,177,0.12)', padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Haverim Mehalzim</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', marginLeft: 12 }}>
            {isAdmin ? 'ADMIN CONSOLE' : 'VOLUNTEER CONSOLE'}
          </span>
        </div>
        <Link to="/account" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← My Account</Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>{error}</div>}
        {incidents === null && !error && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading…</div>}

        {incidents !== null && (
          <>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1.25rem' }}>
              ◈ Incidents opened through accounts ({incidents.length})
            </div>
            {incidents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                No incidents have been opened through the account dashboard yet.
              </div>
            ) : (
              incidents.map(inc => (
                <IncidentRowCard
                  key={inc.id} incident={inc} canManage={isAdmin}
                  expanded={expandedId === inc.id}
                  onToggle={() => setExpandedId(expandedId === inc.id ? null : inc.id)}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
