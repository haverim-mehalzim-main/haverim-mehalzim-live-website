import { Link } from 'react-router-dom';
import '../features/account/people.css';

// Landing pages Tranzila redirects the browser to after a payment attempt —
// shared by both the donation flow (/donate/thanks|failed) and the premium
// flow (/premium/thanks|failed).
// NOTE: these are cosmetic. The authoritative record of a payment is written
// server-side by /api/tranzilla/notify — never trust this page as proof of payment.

interface Props {
  variant: 'thanks' | 'failed';
  kind?: 'donation' | 'premium';
}

export default function PaymentResultPage({ variant, kind = 'donation' }: Props) {
  const ok = variant === 'thanks';
  const isPremium = kind === 'premium';

  const tone = ok ? (isPremium ? 'amber' : 'teal') : 'red';
  const title = ok
    ? (isPremium ? 'Welcome to Premium' : 'Thank you for your donation')
    : 'Payment not completed';
  const body = ok
    ? (isPremium
        ? 'Your premium membership is now active, permanently. A confirmation has been sent to your email, and your account is ready whenever you want to log in and check your status.'
        : 'Your contribution goes straight to funding the volunteers who respond. A confirmation has been sent to your email.')
    : 'Your payment did not go through and you have not been charged. You can try again whenever you are ready.';

  return (
    <div className="pay-page">
      <div className="pay-card" data-tone={tone}>
        <div className="pay-icon" aria-hidden="true">{ok ? (isPremium ? '★' : '✓') : '✕'}</div>
        <h1 className="pay-title">{title}</h1>
        <p className="pay-body">{body}</p>
        <div className="pay-actions">
          <Link to="/" className="pay-btn">Back to the site</Link>
          {ok && isPremium ? (
            <Link to="/account" className="pay-btn pay-btn--ghost">Your account</Link>
          ) : (
            <Link to="/map" className="pay-btn pay-btn--ghost">Live map</Link>
          )}
        </div>
      </div>
    </div>
  );
}
