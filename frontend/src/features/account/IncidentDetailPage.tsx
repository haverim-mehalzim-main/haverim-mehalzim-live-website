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
  status_label_en?: string;
  handled: boolean;
  found_on_monday?: boolean;
  patient_name: string;
  patient_age?: string;
  patient_gender?: string;
  patient_phone?: string;
  filer_info?: string;
  city?: string;
  country?: string;
  country_code?: string;
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

  // ── Extended case detail (admin dashboard + edit) ──────────────────────
  incident_status_en?: string;
  case_stage_en?: string;
  insurance_en?: string;
  combat_service_en?: string;
  call_source_en?: string;
  ccc_official_en?: string;
  incident_manager_en?: string;
  supervisor_en?: string;
  in_request_at?: string;
  closed_at?: string;
  closure_summary?: string;
  closure_lessons?: string;
  closure_locating_point?: string;
}

interface IncidentFieldOptions {
  statuses: string[];
  incident_statuses: string[];
  case_stages: string[];
  genders: string[];
  combat_services: string[];
  insurances: string[];
  call_sources: string[];
  ccc_officials: string[];
  incident_managers: string[];
  supervisors: string[];
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

// ── Admin-only: edit the incident's own details, written through to Monday ──
interface CountryOption { code: string; name: string; }

interface CaseEditForm {
  incidentType: string;
  statusLabel: string;
  incidentStatus: string;
  caseStage: string;
  description: string;
  countryCode: string;
  city: string;
  inRequestAt: string;
  closedAt: string;
  patientAge: string;
  patientGender: string;
  patientPhone: string;
  callerInfo: string;
  combatService: string;
  insurance: string;
  callSource: string;
  cccOfficial: string;
  incidentManager: string;
  supervisor: string;
  lifeThreatening: boolean;
}

function formFromIncident(incident: IncidentDetail): CaseEditForm {
  return {
    incidentType: incident.incident_type || '',
    statusLabel: incident.status_label_en || '',
    incidentStatus: incident.incident_status_en || '',
    caseStage: incident.case_stage_en || '',
    description: incident.description || '',
    countryCode: incident.country_code || '',
    city: incident.city || '',
    inRequestAt: incident.in_request_at || '',
    closedAt: incident.closed_at || '',
    patientAge: incident.patient_age || '',
    patientGender: incident.patient_gender || '',
    patientPhone: incident.patient_phone || '',
    callerInfo: incident.filer_info || '',
    combatService: incident.combat_service_en || '',
    insurance: incident.insurance_en || '',
    callSource: incident.call_source_en || '',
    cccOfficial: incident.ccc_official_en || '',
    incidentManager: incident.incident_manager_en || '',
    supervisor: incident.supervisor_en || '',
    lifeThreatening: incident.life_threatening || false,
  };
}

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="account-field-row">
      <span className="account-field-row-label">{label}</span>
      <span className="account-field-row-value">{value}</span>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label className="account-label">
      {label}
      <select className="account-select" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— Select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="account-label">
      {label}
      <input className="account-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function EditCaseCard({ incident, onSaved }: {
  incident: IncidentDetail; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [options, setOptions] = useState<IncidentFieldOptions | null>(null);
  const [form, setForm] = useState<CaseEditForm>(() => formFromIncident(incident));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof CaseEditForm>(key: K, value: CaseEditForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!editing) return;
    setForm(formFromIncident(incident));
    fetch('/api/incident-types').then(r => r.json()).then(j => { if (j.success) setTypes(j.types); });
    fetch('/api/countries').then(r => r.json()).then(j => { if (j.success) setCountries(j.countries); });
    fetch('/api/staff/incident-field-options').then(r => r.json()).then(j => { if (j.success) setOptions(j); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        description: form.description.trim(),
        city: form.city.trim(),
        in_request_at: form.inRequestAt.trim(),
        closed_at: form.closedAt.trim(),
        caller_info: form.callerInfo.trim(),
        life_threatening: form.lifeThreatening,
      };
      // Dropdown fields: omit entirely when left at "— Select —" — an empty
      // string isn't one of that field's real board labels, so sending it
      // would fail validation instead of just meaning "leave unchanged".
      const maybeLabel = (key: string, value: string) => { if (value) body[key] = value; };
      maybeLabel('incident_type', form.incidentType);
      maybeLabel('status_label', form.statusLabel);
      maybeLabel('incident_status', form.incidentStatus);
      maybeLabel('case_stage', form.caseStage);
      maybeLabel('patient_gender', form.patientGender);
      maybeLabel('combat_service', form.combatService);
      maybeLabel('insurance', form.insurance);
      maybeLabel('call_source', form.callSource);
      maybeLabel('ccc_official', form.cccOfficial);
      maybeLabel('incident_manager', form.incidentManager);
      maybeLabel('supervisor', form.supervisor);
      if (form.countryCode) body.country_code = form.countryCode;
      if (form.patientAge.trim()) body.patient_age = Number(form.patientAge);
      if (form.patientPhone.trim()) body.patient_phone = form.patientPhone.trim();

      const res = await fetch(`/api/staff/incidents/${incident.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        onSaved();
        setWarnings(json.warnings || []);
        setSaved(true);
        setEditing(false);
      } else {
        setError(json.message || 'Could not save changes.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="account-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="account-section-title">◈ Case Details</div>
          <button
            className="account-submit" style={{ width: 'auto', padding: '6px 14px', fontSize: 11 }}
            onClick={() => { setEditing(true); setSaved(false); }}
          >
            ✎ Edit
          </button>
        </div>
        {saved && <p style={{ fontSize: 12, color: 'var(--accent-teal)', marginBottom: 12 }}>✓ Saved to Monday.com.</p>}
        {warnings.length > 0 && warnings.map((w, i) => (
          <p key={i} style={{ fontSize: 12, color: 'var(--accent-amber)', marginBottom: 12 }}>⚠ {w}</p>
        ))}

        <div className="account-field-groups">
          <div className="account-field-group-title">Classification</div>
          <div className="account-field-group-title">Location &amp; Timeline</div>
          <div>
            <FieldRow label="Incident status" value={incident.incident_status_en} />
            <FieldRow label="Case stage" value={incident.case_stage_en} />
            <FieldRow label="Combat service" value={incident.combat_service_en} />
            <FieldRow label="Referral source" value={incident.call_source_en} />
          </div>
          <div>
            <FieldRow label="Country" value={incident.country} />
            <FieldRow label="City / area" value={incident.city} />
            <FieldRow label="Requested" value={incident.in_request_at} />
            <FieldRow label="Closed" value={incident.closed_at} />
          </div>

          <div className="account-field-group-title">Team</div>
          <div className="account-field-group-title">Contacts &amp; Insurance</div>
          <div>
            <FieldRow label="CCC Official" value={incident.ccc_official_en} />
            <FieldRow label="Incident Manager" value={incident.incident_manager_en} />
            <FieldRow label="Supervisor" value={incident.supervisor_en} />
          </div>
          <div>
            <FieldRow label="Caller" value={incident.filer_info} />
            <FieldRow label="Insurance" value={incident.insurance_en} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-card">
      <div className="account-section-title" style={{ marginBottom: 4 }}>◈ Edit Case Details</div>
      <div className="account-form">
        <div className="account-form-section-title">Classification</div>
        <SelectField label="Incident type" value={form.incidentType} onChange={v => set('incidentType', v)} options={types} />
        <SelectField label="Status (internal)" value={form.statusLabel} onChange={v => set('statusLabel', v)} options={options?.statuses ?? []} />
        <SelectField label="Incident status" value={form.incidentStatus} onChange={v => set('incidentStatus', v)} options={options?.incident_statuses ?? []} />
        <SelectField label="Case stage" value={form.caseStage} onChange={v => set('caseStage', v)} options={options?.case_stages ?? []} />
        <SelectField label="Combat service" value={form.combatService} onChange={v => set('combatService', v)} options={options?.combat_services ?? []} />
        <SelectField label="How did we receive the call" value={form.callSource} onChange={v => set('callSource', v)} options={options?.call_sources ?? []} />
        <div className="account-checkbox-row">
          <input type="checkbox" checked={form.lifeThreatening} onChange={e => set('lifeThreatening', e.target.checked)} />
          Life-threatening
        </div>
        <label className="account-label">
          What happened
          <textarea className="account-textarea" value={form.description} onChange={e => set('description', e.target.value)} rows={4} />
        </label>

        <div className="account-form-section-title">Location &amp; Timeline</div>
        <label className="account-label">
          Country
          <select className="account-select" value={form.countryCode} onChange={e => set('countryCode', e.target.value)}>
            <option value="">— Select —</option>
            {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <TextField label="City / area" value={form.city} onChange={v => set('city', v)} placeholder="e.g. Netanya (country is separate, below)" />
        <TextField label="Date/time request received" value={form.inRequestAt} onChange={v => set('inRequestAt', v)} placeholder="e.g. 2026-09-21 14:32" />
        <TextField label="Date/time case closed" value={form.closedAt} onChange={v => set('closedAt', v)} placeholder="e.g. 2026-09-22 09:00" />

        <div className="account-form-section-title">Patient / Contacts</div>
        <TextField label="Patient age" value={form.patientAge} onChange={v => set('patientAge', v.replace(/\D/g, ''))} />
        <SelectField label="Patient gender" value={form.patientGender} onChange={v => set('patientGender', v)} options={options?.genders ?? []} />
        <TextField label="Patient phone" value={form.patientPhone} onChange={v => set('patientPhone', v)} />
        <TextField label="Caller name &amp; phone" value={form.callerInfo} onChange={v => set('callerInfo', v)} />
        <SelectField label="Insurance" value={form.insurance} onChange={v => set('insurance', v)} options={options?.insurances ?? []} />

        <div className="account-form-section-title">Team</div>
        <SelectField label="CCC Official" value={form.cccOfficial} onChange={v => set('cccOfficial', v)} options={options?.ccc_officials ?? []} />
        <SelectField label="Incident Manager" value={form.incidentManager} onChange={v => set('incidentManager', v)} options={options?.incident_managers ?? []} />
        <SelectField label="Supervisor" value={form.supervisor} onChange={v => set('supervisor', v)} options={options?.supervisors ?? []} />

        {error && <div className="account-error">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="account-submit" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save to Monday.com'}
          </button>
          <button
            onClick={() => setEditing(false)} disabled={saving}
            style={{ background: 'none', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', padding: '0 18px', fontSize: 13 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin-only: shown once the incident's workflow status is "Done" —────────
function CaseClosureCard({ incident, onSaved }: { incident: IncidentDetail; onSaved: () => void }) {
  const [summary, setSummary] = useState(incident.closure_summary || '');
  const [lessons, setLessons] = useState(incident.closure_lessons || '');
  const [locatingPoint, setLocatingPoint] = useState(incident.closure_locating_point || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`/api/staff/incidents/${incident.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closure_summary: summary.trim(),
          closure_lessons: lessons.trim(),
          closure_locating_point: locatingPoint.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        onSaved();
        setSaved(true);
      } else {
        setError(json.message || 'Could not save changes.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-card">
      <div className="account-section-title" style={{ marginBottom: 4 }}>◈ Case Closure</div>
      <p className="account-detail-desc-text" style={{ marginBottom: 14 }}>
        This case is marked Done — wrap it up for the record.
      </p>
      <div className="account-form">
        <label className="account-label">
          Summary of how we assisted
          <textarea className="account-textarea" value={summary} onChange={e => setSummary(e.target.value)} rows={3} />
        </label>
        <label className="account-label">
          Key lessons
          <textarea className="account-textarea" value={lessons} onChange={e => setLessons(e.target.value)} rows={3} />
        </label>
        <TextField label="Point of locating (if relevant)" value={locatingPoint} onChange={setLocatingPoint} />
        {error && <div className="account-error">{error}</div>}
        {saved && <p style={{ fontSize: 12, color: 'var(--accent-teal)' }}>✓ Saved to Monday.com.</p>}
        <button className="account-submit" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
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

  const loadIncident = useCallback((opts?: { silent?: boolean }) => {
    if (!id) return;
    if (!opts?.silent) setState('loading');
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
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState('not_found'); return; }
    if (!id) { setState('not_found'); return; }
    loadIncident();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <EditCaseCard incident={inc} onSaved={() => loadIncident({ silent: true })} />
        )}

        {relation === 'admin' && inc.incident_status_en === 'Done' && (
          <CaseClosureCard incident={inc} onSaved={() => loadIncident({ silent: true })} />
        )}

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
