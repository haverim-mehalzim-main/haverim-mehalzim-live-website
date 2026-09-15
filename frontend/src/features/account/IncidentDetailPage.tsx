import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './account.css';

interface IncidentDetail {
  id: number;
  incident_type: string;
  location: string;
  description?: string;
  life_threatening: boolean;
  opened_date: string | null;
  status_label?: string;
  handled: boolean;
  found_on_monday?: boolean;
  patient_name: string;
  patient_age?: string;
  patient_gender?: string;
  patient_phone?: string;
  filer_info?: string;
  // Only present for admin/volunteer viewers — who opened this through the app.
  owner?: { email: string; full_name: string } | null;
  // Only present for a follower (macro) view — the warm, step-based framing
  // already used by the public case tracker, not a raw Monday status.
  progress?: {
    step: number;
    step_title: string;
    step_subtitle: string;
    total_steps: number;
    is_sensitive: boolean;
  } | null;
}

interface Task {
  id: number;
  assignee: 'user' | 'staff';
  title: string;
  description: string | null;
  status: 'pending' | 'done';
}

type LoadState = 'loading' | 'not_found' | 'error' | 'ready';
type Relation = 'owner' | 'follower' | 'admin' | 'volunteer';

// ── Owner's read-only task list ──────────────────────────────────────────────
function TaskList({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <div>
      <div className="account-task-col-title">{title}</div>
      {tasks.length === 0 ? (
        <div className="account-empty">Nothing here yet.</div>
      ) : (
        tasks.map(t => (
          <div className="account-task-item" key={t.id}>
            <div className={`account-task-check ${t.status === 'done' ? 'account-task-check--done' : 'account-task-check--pending'}`}>
              {t.status === 'done' ? '✓' : ''}
            </div>
            <div>
              <div className={`account-task-title ${t.status === 'done' ? 'account-task-title--done' : ''}`}>{t.title}</div>
              {t.description && <div className="account-task-desc">{t.description}</div>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ShareCard({ incidentId }: { incidentId: number }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const getLink = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/share`, { method: 'POST' });
      const json = await res.json();
      if (json.success) setShareUrl(json.share_url);
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="account-card">
      <div className="account-section-title" style={{ marginBottom: 10 }}>◈ Share With Family &amp; Friends</div>
      <p className="account-detail-desc-text" style={{ marginBottom: 14 }}>
        Send this link to someone who wants to follow along. They&apos;ll be able to see how things
        are going — no operational details, just the reassurance that this is being handled.
      </p>
      {shareUrl ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="account-input" readOnly value={shareUrl} style={{ flex: 1, minWidth: 200 }} onFocus={e => e.target.select()} />
          <button className="account-submit" style={{ width: 'auto', padding: '10px 18px' }} onClick={copy}>
            {copied ? '✓ Copied' : 'Copy Link'}
          </button>
        </div>
      ) : (
        <button className="account-submit" style={{ width: 'auto', padding: '10px 18px' }} onClick={getLink} disabled={busy}>
          {busy ? 'Generating…' : '🔗 Get Share Link'}
        </button>
      )}
    </div>
  );
}

// ── Staff/admin editable task journey ────────────────────────────────────────
function StaffTaskRow({ task, incidentId, canManage, onChanged, onDeleted }: {
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
    <div className="account-task-item">
      <button
        onClick={toggleStatus} disabled={busy}
        className={`account-task-check ${task.status === 'done' ? 'account-task-check--done' : 'account-task-check--pending'}`}
        style={{ border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {task.status === 'done' ? '✓' : ''}
      </button>
      <div style={{ flex: 1 }}>
        <div className={`account-task-title ${task.status === 'done' ? 'account-task-title--done' : ''}`}>
          {task.title}
          <span style={{
            marginLeft: 8, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: task.assignee === 'user' ? 'var(--accent-amber)' : 'var(--accent-teal)',
          }}>
            {task.assignee}
          </span>
        </div>
        {task.description && <div className="account-task-desc">{task.description}</div>}
      </div>
      {canManage && (
        <button onClick={remove} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
      )}
    </div>
  );
}

function StaffTaskManager({ incidentId, tasks, canManage, onTasksChange }: {
  incidentId: number; tasks: Task[]; canManage: boolean; onTasksChange: (tasks: Task[]) => void;
}) {
  const [assignee, setAssignee] = useState<'user' | 'staff'>('staff');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);

  const addTask = async () => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/staff/incidents/${incidentId}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee, title: title.trim(), description: description.trim() || undefined, sort_order: tasks.length }),
      });
      const json = await res.json();
      if (json.success) { onTasksChange([...tasks, json.task]); setTitle(''); setDescription(''); }
    } finally { setAdding(false); }
  };

  return (
    <div className="account-card">
      <div className="account-section-title" style={{ marginBottom: 16 }}>◈ Case Journey</div>
      {tasks.length === 0 ? (
        <div className="account-empty" style={{ marginBottom: canManage ? 14 : 0 }}>No tasks yet.</div>
      ) : (
        tasks.map(t => (
          <StaffTaskRow
            key={t.id} task={t} incidentId={incidentId} canManage={canManage}
            onChanged={updated => onTasksChange(tasks.map(x => x.id === updated.id ? updated : x))}
            onDeleted={id => onTasksChange(tasks.filter(x => x.id !== id))}
          />
        ))
      )}

      {canManage ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <select className="account-select" value={assignee} onChange={e => setAssignee(e.target.value as 'user' | 'staff')} style={{ width: 'auto' }}>
            <option value="staff">Staff</option>
            <option value="user">User</option>
          </select>
          <input className="account-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" style={{ flex: 1, minWidth: 140 }} />
          <input className="account-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" style={{ flex: 1, minWidth: 140 }} />
          <button className="account-submit" style={{ width: 'auto', padding: '10px 18px' }} onClick={addTask} disabled={adding || !title.trim()}>+ Add</button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
          You can mark tasks done — only admins can add, edit, or remove tasks.
        </div>
      )}
    </div>
  );
}

export default function IncidentDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>('loading');
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [relation, setRelation] = useState<Relation>('owner');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState('not_found'); return; }
    if (!id) { setState('not_found'); return; }

    fetch(`/api/incidents/${id}`)
      .then(r => {
        if (r.status === 404) throw new Error('not_found');
        if (!r.ok) throw new Error('error');
        return r.json();
      })
      .then(j => {
        if (!j.success) throw new Error('not_found');
        setIncident(j.incident);
        setTasks(j.tasks || []);
        setRelation(j.relation);
        setState('ready');
      })
      .catch(e => setState(e.message === 'not_found' ? 'not_found' : 'error'));
  }, [id, user, authLoading]);

  if (state === 'loading') {
    return (
      <div className="account-page">
        <div className="account-wrapper">
          <div className="account-card account-card--center">Loading…</div>
        </div>
      </div>
    );
  }

  if (state !== 'ready') {
    return (
      <div className="account-page">
        <div className="account-wrapper account-wrapper--narrow">
          <nav className="account-nav">
            <Link to="/account" className="account-back">← Back to My Account</Link>
            <div className="account-nav-brand"><span className="account-nav-brand-dot" />Haverim Mehalzim</div>
          </nav>
          <div className="account-card account-card--center">
            <p>{state === 'not_found' ? "We couldn't find this case, or you don't have access to it." : 'Something went wrong loading this case.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const inc = incident!;

  // ── Follower (family/friend): macro-only, warm framing, no task list ──────
  if (relation === 'follower') {
    return (
      <div className="account-page">
        <div className="account-wrapper account-wrapper--narrow">
          <nav className="account-nav">
            <Link to="/account" className="account-back">← Back to My Account</Link>
            <div className="account-nav-brand"><span className="account-nav-brand-dot" />Haverim Mehalzim</div>
          </nav>

          <div className="account-card">
            <div className="account-incident-top">
              <div className="account-incident-type">{inc.patient_name || inc.incident_type || 'Case'}</div>
              <span className={`account-incident-badge ${inc.handled ? 'account-incident-badge--past' : 'account-incident-badge--ongoing'}`}>
                {inc.handled ? 'Resolved' : 'Ongoing'}
              </span>
            </div>
            <div className="account-incident-meta" style={{ marginBottom: 20 }}>
              {inc.location}{inc.opened_date ? ` · since ${inc.opened_date}` : ''}
            </div>

            {inc.progress && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--accent-teal-dim)', border: '1px solid var(--border-accent)',
                  color: 'var(--accent-teal)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                  marginBottom: 16,
                }}>
                  {inc.progress.step}/{inc.progress.total_steps}
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 6, color: 'var(--text-primary)' }}>
                  {inc.progress.step_title}
                </h2>
                <p className="account-detail-desc-text" style={{ maxWidth: 340, margin: '0 auto' }}>
                  {inc.progress.step_subtitle}
                </p>
              </div>
            )}
          </div>

          <div className="account-card account-card--center" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            You&apos;re following this case as a family member or friend. The person who opened it
            can see the full details and next steps.
          </div>
        </div>
      </div>
    );
  }

  const isStaffRelation = relation === 'admin' || relation === 'volunteer';
  const backLink = isStaffRelation ? '/staff/incidents' : '/account';
  const backLabel = isStaffRelation ? '← Back to Staff Console' : '← Back to My Account';

  // ── Owner or staff (admin/volunteer): full detail + task journey ──────────
  const userTasks  = tasks.filter(t => t.assignee === 'user');
  const staffTasks = tasks.filter(t => t.assignee === 'staff');

  return (
    <div className="account-page">
      <div className="account-wrapper">
        <nav className="account-nav">
          <Link to={backLink} className="account-back">{backLabel}</Link>
          <div className="account-nav-brand"><span className="account-nav-brand-dot" />Haverim Mehalzim</div>
        </nav>

        <div className="account-card">
          <div className="account-incident-top">
            <div className="account-incident-type">{inc.incident_type || 'Case'}</div>
            <div>
              <span className={`account-incident-badge ${inc.handled ? 'account-incident-badge--past' : 'account-incident-badge--ongoing'}`}>
                {inc.handled ? 'Resolved' : 'Ongoing'}
              </span>
              {inc.life_threatening && <span className="account-incident-badge account-incident-badge--urgent">Urgent</span>}
            </div>
          </div>
          <div className="account-incident-meta" style={{ marginBottom: 14 }}>
            {inc.location}{inc.opened_date ? ` · opened ${inc.opened_date}` : ''}
            {isStaffRelation && inc.found_on_monday === false && (
              <span style={{ color: 'var(--accent-amber)' }}> · ⚠ not found on Monday</span>
            )}
          </div>
          {isStaffRelation && inc.owner && (
            <div className="account-incident-meta" style={{ marginBottom: 14 }}>
              Filed by account: {inc.owner.full_name} · {inc.owner.email}
            </div>
          )}
          {inc.description && (
            <>
              <div className="account-detail-desc-label">What happened</div>
              <p className="account-detail-desc-text">{inc.description}</p>
            </>
          )}

          <div className="account-detail-grid">
            {inc.patient_name && (
              <div>
                <div className="account-detail-item-label">Patient / missing person</div>
                <div className="account-detail-item-value">
                  {inc.patient_name}
                  {inc.patient_age ? `, age ${inc.patient_age}` : ''}
                  {inc.patient_gender ? ` (${inc.patient_gender})` : ''}
                </div>
              </div>
            )}
            {inc.patient_phone && (
              <div>
                <div className="account-detail-item-label">Patient phone</div>
                <div className="account-detail-item-value">{inc.patient_phone}</div>
              </div>
            )}
            {inc.filer_info && (
              <div>
                <div className="account-detail-item-label">Filed by</div>
                <div className="account-detail-item-value">{inc.filer_info}</div>
              </div>
            )}
          </div>
        </div>

        {isStaffRelation ? (
          <StaffTaskManager
            incidentId={inc.id}
            tasks={tasks}
            canManage={relation === 'admin'}
            onTasksChange={setTasks}
          />
        ) : (
          <div className="account-card">
            <div className="account-section-title" style={{ marginBottom: 16 }}>◈ Case Journey</div>
            <div className="account-task-columns">
              <TaskList title="Things you need to do" tasks={userTasks} />
              <TaskList title="What Haverim Mehalzim is doing" tasks={staffTasks} />
            </div>
          </div>
        )}

        {relation === 'owner' && <ShareCard incidentId={inc.id} />}
      </div>
    </div>
  );
}
