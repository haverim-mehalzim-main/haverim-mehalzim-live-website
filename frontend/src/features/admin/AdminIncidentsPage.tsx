import { useCallback, useState } from 'react';

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

function TaskRow({ task, token, incidentId, onChanged, onDeleted }: {
  task: Task; token: string; incidentId: number;
  onChanged: (t: Task) => void; onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const toggleStatus = useCallback(async () => {
    setBusy(true);
    try {
      const nextStatus = task.status === 'done' ? 'pending' : 'done';
      const res = await fetch(`/api/admin/incidents/${incidentId}/tasks/${task.id}`, {
        method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (json.success) onChanged(json.task);
    } finally { setBusy(false); }
  }, [task, incidentId, token]);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/incidents/${incidentId}/tasks/${task.id}`, { method: 'DELETE', headers: authHeaders });
      if (res.ok) onDeleted(task.id);
    } finally { setBusy(false); }
  }, [task, incidentId, token]);

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
      <button onClick={remove} disabled={busy} style={{
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 12,
      }}>✕</button>
    </div>
  );
}

function TaskManager({ incident, token }: { incident: IncidentRow; token: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assignee, setAssignee] = useState<'user' | 'staff'>('staff');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);

  const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(() => {
    fetch(`/api/admin/incidents/${incident.id}/tasks`, { headers: authHeaders })
      .then(r => r.json())
      .then(j => { if (j.success) setTasks(j.tasks); });
  }, [incident.id, token]);

  if (tasks === null) { load(); return <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Loading tasks…</div>; }

  const addTask = async () => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/incidents/${incident.id}/tasks`, {
        method: 'POST', headers: authHeaders,
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
          key={t.id} task={t} token={token} incidentId={incident.id}
          onChanged={updated => setTasks(tasks.map(x => x.id === updated.id ? updated : x))}
          onDeleted={id => setTasks(tasks.filter(x => x.id !== id))}
        />
      ))}

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
    </div>
  );
}

function IncidentRowCard({ incident, token, expanded, onToggle }: {
  incident: IncidentRow; token: string; expanded: boolean; onToggle: () => void;
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
      {expanded && <TaskManager incident={incident} token={token} />}
    </div>
  );
}

export default function AdminIncidentsPage() {
  const [token, setToken] = useState('');
  const [incidents, setIncidents] = useState<IncidentRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/incidents', { headers: { 'Authorization': `Bearer ${t}` } });
      if (res.status === 403) { setError('Wrong token.'); setIncidents(null); return; }
      const json = await res.json();
      if (!json.success) { setError('Failed to load.'); return; }
      setIncidents(json.incidents);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, []);

  const isLoggedIn = incidents !== null;

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: `${BG}ee`, backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,201,177,0.12)', padding: '1rem 1.5rem',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Haverim Mehalzim</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', marginLeft: 12 }}>INCIDENTS ADMIN</span>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        {!isLoggedIn && (
          <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, margin: '4rem auto' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1.25rem' }}>◈ Admin Access</div>
            <input
              type="password" placeholder="Enter admin token" value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && token && load(token)}
              style={{
                width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0',
                fontFamily: MONO, fontSize: 13, padding: '0.7rem 0.9rem', outline: 'none', marginBottom: '0.75rem',
              }}
            />
            {error && <p style={{ fontSize: 11, color: '#f87171', margin: '0 0 0.75rem' }}>{error}</p>}
            <button
              onClick={() => token && load(token)} disabled={loading || !token}
              style={{
                width: '100%', padding: '0.75rem', background: TEAL, color: BG, border: 'none',
                borderRadius: 8, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', cursor: loading || !token ? 'not-allowed' : 'pointer', opacity: loading || !token ? 0.6 : 1,
              }}
            >
              {loading ? 'Loading…' : 'Access →'}
            </button>
          </div>
        )}

        {isLoggedIn && (
          <>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1.25rem' }}>
              ◈ Incidents opened through accounts ({incidents!.length})
            </div>
            {incidents!.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                No incidents have been opened through the account dashboard yet.
              </div>
            ) : (
              incidents!.map(inc => (
                <IncidentRowCard
                  key={inc.id} incident={inc} token={token}
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
