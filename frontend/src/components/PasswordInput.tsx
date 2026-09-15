import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

// Plain <input type="password"> with a show/hide toggle. Shares styling with
// whatever className is passed in (e.g. "auth-input") — only adds the toggle
// button and the wrapper needed to position it inside the field.
export default function PasswordInput({ className, ...rest }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-wrap">
      <input {...rest} className={className} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible(v => !v)}
        // Doesn't submit the form, isn't part of the tab order for filling
        // in the password — purely a display toggle.
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M2 2l12 12M6.5 6.7A2.5 2.5 0 0 0 8 10.5c.5 0 .95-.15 1.33-.4M4.2 4.3C2.6 5.4 1.5 7 1 8c1.3 2.6 4 4.8 7 4.8 1.1 0 2.1-.3 3-.8M11 4.3c1.2.8 2.2 1.9 3 3.2"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M1 8c1.3-2.6 4-4.8 7-4.8S13.7 5.4 15 8c-1.3 2.6-4 4.8-7 4.8S2.3 10.6 1 8z"/>
            <circle cx="8" cy="8" r="2.3"/>
          </svg>
        )}
      </button>
    </div>
  );
}
