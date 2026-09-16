import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { CASE_JOURNEY_STEPS, CASE_JOURNEY_STEPS_SENSITIVE, journeyStepState } from '../../components/caseJourneySteps';
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

interface VolunteerRequest {
  id: number;
  user: { email: string; full_name: string } | null;
  requested_at: string;
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

// ── Family/friend: the case journey as a ring + connected step timeline ─────
const JOURNEY_RADIUS = 52;
const JOURNEY_CIRC = 2 * Math.PI * JOURNEY_RADIUS;

function FamilyJourneyCard({ progress }: {
  progress: { step: number; step_title: string; step_subtitle: string; total_steps: number; is_sensitive: boolean };
}) {
  const steps = progress.is_sensitive ? CASE_JOURNEY_STEPS_SENSITIVE : CASE_JOURNEY_STEPS;
  const current = Math.min(Math.max(progress.step, 1), progress.total_steps);
  const offset = JOURNEY_CIRC * (1 - current / progress.total_steps);

  return (
    <div className={`account-journey${progress.is_sensitive ? ' sensitive' : ''}`}>
      <div className="account-journey-ring-wrap">
        <svg className="account-journey-ring-svg" viewBox="0 0 128 128">
          <circle className="account-journey-ring-track" cx="64" cy="64" r={JOURNEY_RADIUS} />
          <circle
            className="account-journey-ring-fill"
            cx="64" cy="64" r={JOURNEY_RADIUS}
            strokeDasharray={JOURNEY_CIRC}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="account-journey-ring-center">
          <div className="account-journey-ring-num">{current}</div>
          <div className="account-journey-ring-denom">of {progress.total_steps}</div>
        </div>
      </div>
      <div className="account-journey-current-title">{progress.step_title}</div>
      <p className="account-journey-current-subtitle">{progress.step_subtitle}</p>

      <div className="account-journey-timeline">
        {steps.map((s, idx) => {
          const state = journeyStepState(s, current);
          return (
            <div key={s.step}>
              {idx > 0 && <div className={`account-journey-connector ${s.step <= current ? 'filled' : 'empty'}`} />}
              <div className={`account-journey-step ${state}`}>
                <div className="account-journey-step-node">
                  {state === 'complete' ? '✓' : state === 'active' ? s.icon : s.step}
                </div>
                <div className="account-journey-step-body">
                  <div className="account-journey-step-title">{s.title}</div>
                  <div className="account-journey-step-subtitle">{s.subtitle}</div>
                  {state === 'active' && <span className="account-journey-step-pill">In Progress</span>}
                  {state === 'complete' && <span className="account-journey-step-pill">Complete</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
  }, [task, incidentId, onChanged]);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/incidents/${incidentId}/tasks/${task.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(task.id);
    } finally { setBusy(false); }
  }, [task, incidentId, onDeleted]);

  return (
    <div className="account-task-item">
      <button
        onClick={toggleStatus} disabled={busy}
        className={`account-task-check ${task.status === 'done' ? 'account-task-check--done' : 'account-task-check--pending'}`}
        style={{ cursor: 'pointer', padding: 0 }}
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
  incidentId: number; tasks: Task[]; canManage: boolean; onTasksChange: Dispatch<SetStateAction<Task[]>>;
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
      // Functional update: always applies on top of the latest state, not
      // whatever `tasks` this closure happened to capture — see the same
      // reasoning on onChanged/onDeleted below.
      if (json.success) { onTasksChange(prev => [...prev, json.task]); setTitle(''); setDescription(''); }
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
            // Functional updates so two rows resolving close together (or a
            // row's handler firing from a stale render) can never clobber
            // each other by writing back an outdated snapshot of the list.
            onChanged={updated => onTasksChange(prev => prev.map(x => x.id === updated.id ? updated : x))}
            onDeleted={id => onTasksChange(prev => prev.filter(x => x.id !== id))}
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

// ── Volunteer who hasn't been approved for this incident yet ────────────────
function VolunteerJoinCard({ incidentId, alreadyRequested, onRequested }: {
  incidentId: number; alreadyRequested: boolean; onRequested: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(alreadyRequested);

  const request = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/incidents/${incidentId}/volunteer-request`, { method: 'POST' });
      const json = await res.json();
      if (json.success) { setRequested(true); onRequested(); }
    } finally { setBusy(false); }
  };

  return (
    <div className="account-card account-card--center">
      {requested ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>⏳ Your request to assist this case is waiting on admin approval.</p>
      ) : (
        <>
          <p className="account-detail-desc-text" style={{ marginBottom: 14 }}>
            Want to help with this case? Request to join — an admin needs to approve it before you can see full
            contact details and work its task list.
          </p>
          <button className="account-submit" style={{ width: 'auto', padding: '10px 18px' }} onClick={request} disabled={busy}>
            {busy ? 'Requesting…' : 'Request to Join'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Admin-only: approve or deny volunteers asking to join this incident ─────
function VolunteerRequestsCard({ incidentId, requests, onChanged }: {
  incidentId: number; requests: VolunteerRequest[]; onChanged: (requests: VolunteerRequest[]) => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);

  const approve = async (reqId: number) => {
    setBusyId(reqId);
    try {
      const res = await fetch(`/api/staff/incidents/${incidentId}/volunteers/${reqId}/approve`, { method: 'POST' });
      if (res.ok) onChanged(requests.filter(r => r.id !== reqId));
    } finally { setBusyId(null); }
  };

  const deny = async (reqId: number) => {
    setBusyId(reqId);
    try {
      const res = await fetch(`/api/staff/incidents/${incidentId}/volunteers/${reqId}`, { method: 'DELETE' });
      if (res.ok) onChanged(requests.filter(r => r.id !== reqId));
    } finally { setBusyId(null); }
  };

  if (requests.length === 0) return null;

  return (
    <div className="account-card">
      <div className="account-section-title" style={{ marginBottom: 14 }}>◈ Volunteers Requesting to Join ({requests.length})</div>
      {requests.map(r => (
        <div className="account-task-item" key={r.id}>
          <div style={{ flex: 1 }}>
            <div className="account-task-title">{r.user?.full_name || 'Unknown'}</div>
            <div className="account-task-desc">{r.user?.email}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="account-submit" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }} onClick={() => approve(r.id)} disabled={busyId === r.id}>
              Approve
            </button>
            <button
              onClick={() => deny(r.id)} disabled={busyId === r.id}
              style={{ background: 'none', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '6px 12px' }}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function IncidentDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  // React Router doesn't remount this page when navigating to the same
  // /incidents/:id it's already on (e.g. Staff Console → this incident →
  // back → this incident again) — location.key changes on every navigation
  // entry, even to an identical path, so it's what actually forces a refetch.
  // Without it, a volunteer approved to join after their first (preview)
  // visit would keep seeing that stale snapshot, tasks and all, until a
  // hard reload.
  const location = useLocation();
  const [state, setState] = useState<LoadState>('loading');
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [relation, setRelation] = useState<Relation>('owner');
  // Only meaningful for relation === 'volunteer' — owner/follower/admin
  // default to `joined: true` so they never hit the not-yet-approved branch.
  const [joined, setJoined] = useState(true);
  const [joinRequested, setJoinRequested] = useState(false);
  const [volunteerRequests, setVolunteerRequests] = useState<VolunteerRequest[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState('not_found'); return; }
    if (!id) { setState('not_found'); return; }

    setState('loading');
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
        setJoined(j.joined !== false);
        setJoinRequested(!!j.join_requested);
        setVolunteerRequests(j.volunteer_requests || []);
        setState('ready');
      })
      .catch(e => setState(e.message === 'not_found' ? 'not_found' : 'error'));
  }, [id, user, authLoading, location.key]);

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
            <div className="account-incident-meta">
              {inc.location}{inc.opened_date ? ` · since ${inc.opened_date}` : ''}
            </div>
          </div>

          {inc.progress && (
            <div className="account-card">
              <FamilyJourneyCard progress={inc.progress} />
            </div>
          )}

          <div className="account-card account-card--center" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            You&apos;re following this case as a family member or friend. The person who opened it
            can see the full details and next steps.
          </div>
        </div>
      </div>
    );
  }

  // ── Volunteer, not (yet) approved for this incident: reduced preview ──────
  if (relation === 'volunteer' && !joined) {
    return (
      <div className="account-page">
        <div className="account-wrapper account-wrapper--narrow">
          <nav className="account-nav">
            <Link to="/staff/incidents" className="account-back">← Back to Staff Console</Link>
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
              {inc.found_on_monday === false && <span style={{ color: 'var(--accent-amber)' }}> · ⚠ not found on Monday</span>}
            </div>
            {inc.description && (
              <>
                <div className="account-detail-desc-label">What happened</div>
                <p className="account-detail-desc-text">{inc.description}</p>
              </>
            )}
            {inc.patient_name && (
              <div className="account-detail-grid">
                <div>
                  <div className="account-detail-item-label">Patient / missing person</div>
                  <div className="account-detail-item-value">
                    {inc.patient_name}
                    {inc.patient_age ? `, age ${inc.patient_age}` : ''}
                    {inc.patient_gender ? ` (${inc.patient_gender})` : ''}
                  </div>
                </div>
              </div>
            )}
          </div>

          <VolunteerJoinCard incidentId={inc.id} alreadyRequested={joinRequested} onRequested={() => setJoinRequested(true)} />
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

        {relation === 'admin' && (
          <VolunteerRequestsCard incidentId={inc.id} requests={volunteerRequests} onChanged={setVolunteerRequests} />
        )}

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
