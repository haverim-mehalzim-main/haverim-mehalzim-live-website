import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './premium.css';

type Currency = 'USD' | 'ILS';
const USD_TO_ILS_FALLBACK = 3.7;

export default function PremiumPage() {
  const { user } = useAuth();
  const [currency, setCurrency] = useState<Currency>('USD');
  const [rate, setRate] = useState(USD_TO_ILS_FALLBACK);
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/payment-config')
      .then(r => r.json())
      .then(j => {
        if (!j?.success) return;
        if (j.usd_to_ils > 0) setRate(j.usd_to_ils);
        if (j.premium_price_usd > 0) setPriceUsd(j.premium_price_usd);
      })
      .catch(() => {});
  }, []);

  // Prefill from the session if logged in — don't clobber manual edits.
  useEffect(() => {
    if (!user) return;
    setName(prev => prev || user.full_name);
    setEmail(prev => prev || user.email);
  }, [user]);

  const symbol = currency === 'USD' ? '$' : '₪';
  const displayPrice = priceUsd == null ? null : Math.round(currency === 'USD' ? priceUsd : priceUsd * rate);
  const alreadyPremium = user?.roles.includes('premium') ?? false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim())                                     { setError('Please enter your name.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))  { setError('Please enter a valid email.'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/premium/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency,
          donor_name:  name.trim(),
          donor_email: email.trim(),
          donor_phone: phone.trim(),
        }),
      });
      const json = await res.json();
      if (json.success && json.payment_url) {
        window.location.href = json.payment_url; // hand off to Tranzila
      } else {
        setError(json.message || 'Could not start the payment. Please try again.');
        setBusy(false);
      }
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="premium-page">
      <div className="premium-wrapper">
        <nav className="premium-nav">
          <Link to="/" className="premium-back">← Back to Dashboard</Link>
          <div className="premium-nav-brand">
            <span className="premium-nav-brand-dot" />
            Haverim Mehalzim
          </div>
        </nav>

        <div className="premium-hero">
          <div className="premium-eyebrow">★ Premium Membership</div>
          <h1 className="premium-title">Priority access, whenever you need it.</h1>
          <p className="premium-sub">
            A one-time contribution that unlocks permanent premium status — starting with
            24/7 priority availability, with more benefits on the way.
          </p>
        </div>

        {alreadyPremium ? (
          <div className="premium-card premium-card--center">
            <div className="premium-badge-icon">★</div>
            <h2>You&apos;re already Premium</h2>
            <p className="premium-sub" style={{ margin: '8px 0 20px' }}>
              Thank you for your support — your premium status is active and permanent.
            </p>
            <Link to="/account" className="premium-submit" style={{ display: 'inline-block', textDecoration: 'none' }}>
              View My Account
            </Link>
          </div>
        ) : (
          <div className="premium-card">
            <div className="premium-price-row">
              <div className="premium-price">
                {displayPrice == null ? '—' : `${symbol}${displayPrice.toLocaleString()}`}
              </div>
              <div className="premium-price-sub">ONE-TIME · LIFETIME STATUS</div>
              <div className="premium-currency-toggle">
                {(['USD', 'ILS'] as Currency[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`premium-cur-btn${currency === c ? ' active' : ''}`}
                  >
                    {c === 'USD' ? '$ USD' : '₪ ILS'}
                  </button>
                ))}
              </div>
            </div>

            <ul className="premium-benefits">
              <li>24/7 priority availability</li>
              <li>More benefits coming soon</li>
            </ul>

            <form className="premium-form" onSubmit={submit}>
              <input
                className="premium-input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Full name" autoComplete="name"
              />
              <input
                className="premium-input" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email" type="email" autoComplete="email"
              />
              <input
                className="premium-input" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="Phone (optional)" type="tel" autoComplete="tel"
              />
              {error && <div className="premium-error">{error}</div>}
              <button className="premium-submit" type="submit" disabled={busy || priceUsd == null}>
                {busy ? 'Redirecting to secure payment…' : 'Continue to secure payment →'}
              </button>
              <div className="premium-secure">🔒 Processed securely by Tranzila. We never see your card details.</div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
