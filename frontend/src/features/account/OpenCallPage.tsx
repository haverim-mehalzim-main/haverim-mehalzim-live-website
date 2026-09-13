import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './account.css';

export default function OpenCallPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [types, setTypes] = useState<string[]>([]);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [incidentType, setIncidentType] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [description, setDescription] = useState('');
  const [filerName, setFilerName] = useState('');
  const [filerPhone, setFilerPhone] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
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

    fetch('/api/countries')
      .then(r => r.json())
      .then(j => {
        if (j?.success && Array.isArray(j.countries)) {
          setCountries(j.countries);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.full_name) setFilerName(prev => prev || user.full_name);
  }, [user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!incidentType)          { setError('Please choose an incident type.'); return; }
    if (!city.trim())           { setError('Please enter a city.'); return; }
    if (!countryCode)           { setError('Please choose a country.'); return; }
    if (!description.trim())    { setError('Please describe what happened and what you need.'); return; }
    if (!filerName.trim())      { setError('Please enter the name of the person filling in this form.'); return; }
    if (!filerPhone.trim())     { setError('Please enter a phone number for the person filling in this form.'); return; }
    if (!patientName.trim())    { setError('Please enter the full name of the patient/missing person.'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_type: incidentType,
          city: city.trim(),
          country_code: countryCode,
          description: description.trim(),
          filer_name: filerName.trim(),
          filer_phone: filerPhone.trim(),
          patient_name: patientName.trim(),
          patient_age: patientAge.trim() ? Number(patientAge) : undefined,
          patient_gender: patientGender || undefined,
          patient_phone: patientPhone.trim(),
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
              City
              <input
                className="account-input"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="e.g. Bangkok"
              />
            </label>

            <label className="account-label">
              Country
              <select
                className="account-select"
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
              >
                <option value="">Select a country</option>
                {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
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

            <div className="account-section-title" style={{ marginTop: 8, fontSize: 12 }}>Your details</div>

            <label className="account-label">
              Your full name (person filling in this form)
              <input
                className="account-input"
                value={filerName}
                onChange={e => setFilerName(e.target.value)}
                placeholder="Full name"
              />
            </label>

            <label className="account-label">
              Your phone number
              <input
                className="account-input"
                value={filerPhone}
                onChange={e => setFilerPhone(e.target.value)}
                placeholder="e.g. +972 50 123 4567"
              />
            </label>

            <div className="account-section-title" style={{ marginTop: 8, fontSize: 12 }}>Patient / missing person details</div>

            <label className="account-label">
              Full name
              <input
                className="account-input"
                value={patientName}
                onChange={e => setPatientName(e.target.value)}
                placeholder="Full name"
              />
            </label>

            <label className="account-label">
              Age
              <input
                className="account-input"
                type="number"
                min={0}
                max={150}
                value={patientAge}
                onChange={e => setPatientAge(e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="account-label">
              Gender
              <select
                className="account-select"
                value={patientGender}
                onChange={e => setPatientGender(e.target.value)}
              >
                <option value="">Prefer not to say</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label className="account-label">
              Phone number
              <input
                className="account-input"
                value={patientPhone}
                onChange={e => setPatientPhone(e.target.value)}
                placeholder="Optional"
              />
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
