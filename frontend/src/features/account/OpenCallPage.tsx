import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './account.css';

export default function OpenCallPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [types, setTypes] = useState<string[]>([]);
  const [incidentType, setIncidentType] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [lifeThreatening, setLifeThreatening] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/incident-types')
      .then(r => r.json())
      .then(j => {
        if (j?.success && Array.isArray(j.types)) {
          setTypes(j.types);
          setIncidentType(prev => prev || j.types[0] || '');
        }
      })
      .catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!incidentType)        { setError('Please choose an incident type.'); return; }
    if (!location.trim())     { setError('Please enter a location.'); return; }
    if (!description.trim()) { setError('Please describe what happened and what you need.'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_type: incidentType,
          location: location.trim(),
          description: description.trim(),
          life_threatening: lifeThreatening,
        }),
      });
      const json = await res.json();
      if (json.success && json.incident) {
        navigate(`/account/incidents/${json.incident.id}`);
      } else {
        setError(json.message || 'Could not open the call. Please try again.');
        setBusy(false);
      }
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  };

  if (!loading && !user) {
    return (
      <div className="account-page">
        <div className="account-wrapper account-wrapper--narrow">
          <nav className="account-nav">
            <Link to="/" className="account-back">← Back to Dashboard</Link>
            <div className="account-nav-brand"><span className="account-nav-brand-dot" />Haverim Mehalzim</div>
          </nav>
          <div className="account-card account-card--center">
            <p>Please log in to open a call.</p>
            <Link to="/login" className="account-submit" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 12 }}>
              Log In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <div className="account-wrapper account-wrapper--narrow">
        <nav className="account-nav">
          <Link to="/account" className="account-back">← Back to My Account</Link>
          <div className="account-nav-brand"><span className="account-nav-brand-dot" />Haverim Mehalzim</div>
        </nav>

        <div className="account-card">
          <div className="account-section-title" style={{ marginBottom: 8 }}>◈ Open a Call</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
            Tell us the essentials now so we can open your case right away — a member of our team will
            follow up for any further details we need.
          </p>

          <form className="account-form" onSubmit={submit}>
            <label className="account-label">
              Incident type
              <select
                className="account-select"
                value={incidentType}
                onChange={e => setIncidentType(e.target.value)}
              >
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="account-label">
              Location (city, country)
              <input
                className="account-input"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Bangkok, Thailand"
              />
            </label>

            <label className="account-label">
              What happened? What do you need?
              <textarea
                className="account-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="As much detail as you can — this helps us respond faster."
              />
            </label>

            <label className="account-checkbox-row">
              <input type="checkbox" checked={lifeThreatening} onChange={e => setLifeThreatening(e.target.checked)} />
              This is a life-threatening emergency
            </label>

            {error && <div className="account-error">{error}</div>}

            <button className="account-submit" type="submit" disabled={busy}>
              {busy ? 'Opening call…' : 'Open Call'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
