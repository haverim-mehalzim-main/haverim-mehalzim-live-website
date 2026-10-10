import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { CountryCombobox } from './CountryCombobox';
import './account.css';
import './people.css';

type FieldKey = 'incidentType' | 'city' | 'countryCode' | 'description' | 'filerName' | 'filerPhone' | 'patientName';
type Errors = Partial<Record<FieldKey, string>>;

const GENDERS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
];

function Field({ id, label, optional, help, error, children }: {
  id: string; label: string; optional?: boolean; help?: string; error?: string; children: ReactNode;
}) {
  return (
    <div className="call-field" data-invalid={error ? 'true' : undefined} id={`field-${id}`}>
      <label className="call-label" htmlFor={id}>
        <span>{label}</span>
        {optional && <span className="call-optional">Optional</span>}
      </label>
      {children}
      {error ? <div className="call-field-error" role="alert">{error}</div> : help && <div className="call-help">{help}</div>}
    </div>
  );
}

function Section({ step, title, hint, children }: { step: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="call-section">
      <div className="call-section-head">
        <div className="call-step">{step}</div>
        <div>
          <h2 className="call-section-title">{title}</h2>
          <div className="call-section-hint">{hint}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

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
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/incident-types')
      .then(r => r.json())
      .then(j => { if (j?.success && Array.isArray(j.types)) setTypes(j.types); })
      .catch(() => {});

    fetch('/api/countries')
      .then(r => r.json())
      .then(j => { if (j?.success && Array.isArray(j.countries)) setCountries(j.countries); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.full_name) setFilerName(prev => prev || user.full_name);
  }, [user]);

  const clear = (key: FieldKey) => setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const found: Errors = {};
    if (!incidentType)       found.incidentType = 'Choose the closest match.';
    if (!city.trim())        found.city = 'Enter the city.';
    if (!countryCode)        found.countryCode = 'Choose the country.';
    if (!description.trim()) found.description = 'Tell us what happened and what you need.';
    if (!patientName.trim()) found.patientName = 'Enter the full name of the person who needs help.';
    if (!filerName.trim())   found.filerName = 'Enter your name.';
    if (!filerPhone.trim())  found.filerPhone = 'Enter a phone number we can reach you on.';
    setErrors(found);

    const order: FieldKey[] = ['incidentType', 'city', 'countryCode', 'description', 'patientName', 'filerName', 'filerPhone'];
    const first = order.find(k => found[k]);
    if (first) {
      const el = document.getElementById(`field-${first}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

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
        navigate(`/incidents/${json.incident.id}`, { state: { justOpened: true } });
      } else {
        setFormError(json.message || "We couldn't open the call. Please try again.");
        setBusy(false);
      }
    } catch {
      setFormError('Network error. Please try again.');
      setBusy(false);
    }
  };

  const nav = (back: string, label: string) => (
    <nav className="account-nav">
      <Link to={back} className="account-back">{label}</Link>
      <div className="account-nav-brand"><span className="account-nav-brand-dot" />Haverim Mehalzim</div>
    </nav>
  );

  if (!loading && !user) {
    return (
      <div className="account-page">
        <div className="account-wrapper account-wrapper--narrow">
          {nav('/', '← Back to the site')}
          <div className="call-hero">
            <h1 className="call-title">Let's get you help</h1>
            <p className="call-lead">Log in first so we can open your case and keep you updated. It only takes a moment.</p>
          </div>
          <Link to="/login?next=/account/open-call" className="account-submit" style={{ display: 'block', textDecoration: 'none' }}>Log in</Link>
          <p className="call-submit-note" style={{ marginTop: 14 }}>
            New here? <Link to="/signup?next=/account/open-call" style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>Create an account</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <div className="account-wrapper account-wrapper--narrow">
        {nav('/account', '← Back to your account')}

        <div className="call-hero">
          <h1 className="call-title">Tell us what's happening</h1>
          <p className="call-lead">
            Share the essentials now and we'll open your case right away. A member of our team
            will follow up for anything else we need.
          </p>
          <div className="call-safety" role="note">
            <span aria-hidden="true">⚠</span>
            <span>If someone is in immediate danger, contact local emergency services first.</span>
          </div>
        </div>

        <form onSubmit={submit} noValidate>
          <Section step={1} title="What happened" hint="The more detail, the faster we can respond.">
            <Field id="incidentType" label="Type of help needed" error={errors.incidentType}>
              <div className="call-chips" role="group" aria-label="Type of help needed">
                {types.map(t => (
                  <button
                    key={t} type="button" className="call-chip" aria-pressed={incidentType === t}
                    onClick={() => { setIncidentType(t); clear('incidentType'); }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <div className="call-row">
              <Field id="city" label="City" error={errors.city}>
                <input
                  id="city" className="account-input" value={city} autoComplete="address-level2"
                  onChange={e => { setCity(e.target.value); clear('city'); }} placeholder="e.g. Bangkok"
                />
              </Field>
              <Field id="countryCode" label="Country" error={errors.countryCode}>
                <CountryCombobox
                  id="countryCode" value={countryCode} countries={countries}
                  onChange={code => { setCountryCode(code); clear('countryCode'); }}
                />
              </Field>
            </div>

            <Field
              id="description" label="What happened, and what do you need?" error={errors.description}
              help="Where exactly, what's going on, and what help is needed."
            >
              <textarea
                id="description" className="account-textarea" value={description} maxLength={2000} rows={5}
                onChange={e => { setDescription(e.target.value); clear('description'); }}
                placeholder="Write it in your own words."
              />
            </Field>
          </Section>

          <Section step={2} title="Who needs help" hint="The patient or missing person.">
            <Field id="patientName" label="Full name" error={errors.patientName}>
              <input
                id="patientName" className="account-input" value={patientName}
                onChange={e => { setPatientName(e.target.value); clear('patientName'); }} placeholder="Full name"
              />
            </Field>

            <div className="call-row">
              <Field id="patientAge" label="Age" optional>
                <input
                  id="patientAge" className="account-input" type="number" inputMode="numeric" min={0} max={150}
                  value={patientAge} onChange={e => setPatientAge(e.target.value)}
                />
              </Field>
              <Field id="patientPhone" label="Their phone" optional>
                <input
                  id="patientPhone" className="account-input" type="tel" autoComplete="off"
                  value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="+972 50 123 4567"
                />
              </Field>
            </div>

            <Field id="patientGender" label="Gender" optional>
              <div className="call-seg" role="group" aria-label="Gender">
                {GENDERS.map(g => (
                  <button key={g.label} type="button" aria-pressed={patientGender === g.value} onClick={() => setPatientGender(g.value)}>
                    {g.label}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          <Section step={3} title="How we reach you" hint="So a volunteer can follow up with you directly.">
            <Field id="filerName" label="Your name" error={errors.filerName}>
              <input
                id="filerName" className="account-input" value={filerName} autoComplete="name"
                onChange={e => { setFilerName(e.target.value); clear('filerName'); }} placeholder="Full name"
              />
            </Field>
            <Field id="filerPhone" label="Your phone number" error={errors.filerPhone} help="Include the country code if you're abroad.">
              <input
                id="filerPhone" className="account-input" type="tel" autoComplete="tel" value={filerPhone}
                onChange={e => { setFilerPhone(e.target.value); clear('filerPhone'); }} placeholder="+972 50 123 4567"
              />
            </Field>
          </Section>

          {formError && <div className="account-error" role="alert" style={{ marginBottom: 12 }}>{formError}</div>}

          <div className="call-submit-bar">
            <button className="account-submit" type="submit" disabled={busy}>
              {busy ? 'Opening your call…' : 'Open call'}
            </button>
            <div className="call-submit-note">We'll confirm as soon as it's open.</div>
          </div>
        </form>
      </div>
    </div>
  );
}
