import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export type CountryOption = { code: string; name: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// A country picker you can type into: start typing and the list narrows, Enter
// (or Tab) takes the highlighted match. Still works as a plain dropdown too —
// click or press the down arrow to see every country. `value` is the country
// code, exactly like the <select> this replaces.
export function CountryCombobox({ id, value, onChange, countries, placeholder = 'Type or select' }: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  countries: CountryOption[];
  placeholder?: string;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = countries.find(c => c.code === value);
  const [text, setText] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [typed, setTyped] = useState(false); // has the user typed since opening? (otherwise show the full list)
  const [navigated, setNavigated] = useState(false); // moved with the arrow keys / mouse, so Enter means "this one"

  // Keep the text in step with the value when it changes from outside (or once the list loads).
  useEffect(() => { setText(selected?.name ?? ''); }, [selected?.name]);

  const matches = useMemo(() => {
    const q = norm(text);
    if (!typed || !q) return countries;
    const starts: CountryOption[] = [];
    const contains: CountryOption[] = [];
    for (const c of countries) {
      const n = norm(c.name);
      if (c.code.toLowerCase() === q || n.startsWith(q)) starts.push(c);
      else if (n.includes(q)) contains.push(c);
    }
    return [...starts, ...contains];
  }, [countries, text, typed]);

  useEffect(() => { setActive(0); }, [matches]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (c: CountryOption) => {
    onChange(c.code);
    setText(c.name);
    setTyped(false);
    setNavigated(false);
    setOpen(false);
  };

  const settle = () => {
    // Leaving the field: an exact name counts, anything else snaps back to the current choice.
    const exact = countries.find(c => norm(c.name) === norm(text));
    if (exact) { if (exact.code !== value) onChange(exact.code); setText(exact.name); }
    else setText(selected?.name ?? '');
    setTyped(false);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else { setNavigated(true); setActive(i => Math.min(i + 1, matches.length - 1)); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else { setNavigated(true); setActive(i => Math.max(i - 1, 0)); }
    } else if (e.key === 'Enter') {
      if (open && matches[active] && (typed || navigated)) { e.preventDefault(); choose(matches[active]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); setText(selected?.name ?? ''); setTyped(false); setOpen(false); }
    } else if (e.key === 'Tab') {
      if (open && typed && norm(text) && matches[active]) choose(matches[active]);
    }
  };

  return (
    <div
      className="combo"
      ref={wrapRef}
      onBlur={e => { if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) settle(); }}
    >
      <input
        id={id}
        className="account-input combo-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].code}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        onChange={e => { setText(e.target.value); setTyped(true); setNavigated(false); setOpen(true); }}
        onFocus={e => { e.target.select(); setOpen(true); }}
        onClick={e => { if (!typed) e.currentTarget.select(); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      <span className="combo-caret" aria-hidden="true" />
      {open && (
        <ul id={listId} ref={listRef} className="combo-list" role="listbox">
          {matches.length === 0 && <li className="combo-empty" role="option" aria-disabled="true" aria-selected="false">No country matches “{text}”</li>}
          {matches.map((c, i) => (
            <li
              key={c.code}
              id={`${listId}-${c.code}`}
              role="option"
              aria-selected={c.code === value}
              className={`combo-option${i === active ? ' is-active' : ''}${c.code === value ? ' is-selected' : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => choose(c)}
              onMouseMove={() => setActive(i)}
            >
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
