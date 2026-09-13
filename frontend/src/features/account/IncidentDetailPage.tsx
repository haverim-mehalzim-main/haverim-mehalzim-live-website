import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './account.css';

interface IncidentDetail {
  id: number;
  incident_type: string;
  location: string;
  description: string;
  life_threatening: boolean;
  opened_date: string | null;
  status_label: string;
  handled: boolean;
  found_on_monday: boolean;
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
}

type LoadState = 'loading' | 'not_found' | 'error' | 'ready';

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

export default function IncidentDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>('loading');
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState('not_found'); return; }
    if (!id) { setState('not_found'); return; }

    fetch(`/api/my/incidents/${id}`)
      .then(r => {
        if (r.status === 404) throw new Error('not_found');
        if (!r.ok) throw new Error('error');
        return r.json();
      })
      .then(j => {
        if (!j.success) throw new Error('not_found');
        setIncident(j.incident);
        setTasks(j.tasks || []);
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
  const userTasks  = tasks.filter(t => t.assignee === 'user');
  const staffTasks = tasks.filter(t => t.assignee === 'staff');

  return (
    <div className="account-page">
      <div className="account-wrapper">
        <nav className="account-nav">
          <Link to="/account" className="account-back">← Back to My Account</Link>
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
          </div>
          {inc.description && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{inc.description}</p>
          )}

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))', fontSize: 12, color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
            {inc.patient_name && <div><strong>Patient/missing person:</strong> {inc.patient_name}{inc.patient_age ? `, age ${inc.patient_age}` : ''}{inc.patient_gender ? ` (${inc.patient_gender})` : ''}</div>}
            {inc.patient_phone && <div><strong>Patient phone:</strong> {inc.patient_phone}</div>}
            {inc.filer_info && <div><strong>Filed by:</strong> {inc.filer_info}</div>}
          </div>
        </div>

        <div className="account-card">
          <div className="account-section-title" style={{ marginBottom: 16 }}>◈ Case Journey</div>
          <div className="account-task-columns">
            <TaskList title="Things you need to do" tasks={userTasks} />
            <TaskList title="What Haverim Mehalzim is doing" tasks={staffTasks} />
          </div>
        </div>
      </div>
    </div>
  );
}
