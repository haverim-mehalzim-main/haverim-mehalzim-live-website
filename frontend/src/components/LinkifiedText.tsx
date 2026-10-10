import { Fragment } from 'react';

// Plain text in which any http(s) link becomes clickable (opens in a new tab).
// Used for task descriptions, which staff write as free text. Only http/https
// are linked, and everything else stays as text — no HTML is ever injected.
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

export default function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        // Sentence punctuation right after a link isn't part of it.
        const m = part.match(/^(.*?)([.,;:!?)]*)$/);
        const url = m ? m[1] : part;
        const tail = m ? m[2] : '';
        return (
          <Fragment key={i}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-teal)', fontWeight: 600, wordBreak: 'break-all' }}>{url}</a>
            {tail}
          </Fragment>
        );
      })}
    </>
  );
}
