import { useCallback, useEffect, useState, type SetStateAction } from 'react';

// Last response per URL, kept in module memory only (never localStorage /
// sessionStorage / IndexedDB): staff responses carry case and contact details,
// which must not outlive the tab or sit on disk on a shared computer. It lets a
// page you already visited show instantly while the fresh copy loads, instead
// of a blank "Loading…" every time you navigate back. Cleared on logout and
// whenever the signed-in user changes, so one person's data is never shown to
// the next on the same browser tab.
const cache = new Map<string, unknown>();

export function clearStaffDataCache() {
  cache.clear();
}

// Loads one staff endpoint when the page mounts (and again if `url` changes).
// Shows the cached response for `url`, if any, and always refetches behind it.
// `setData` is exposed for optimistic updates, e.g. removing a row after an
// approve/reject so the list doesn't need a refetch; it updates the cache too,
// so going back to the page doesn't briefly resurrect the removed row.
export function useStaffData<T>(url: string) {
  const [data, setDataState] = useState<T | null>(() => (cache.get(url) as T | undefined) ?? null);
  const [error, setError] = useState('');

  const setData = useCallback((action: SetStateAction<T | null>) => {
    setDataState(prev => {
      const next = typeof action === 'function' ? (action as (p: T | null) => T | null)(prev) : action;
      if (next === null) cache.delete(url);
      else cache.set(url, next);
      return next;
    });
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    // `url` changed (e.g. another status queue): show that URL's cached copy,
    // or nothing if it has none — never the previous URL's data.
    setDataState((cache.get(url) as T | undefined) ?? null);
    setError('');
    fetch(url)
      .then(r => {
        if (r.status === 403) throw new Error('Forbidden');
        return r.json();
      })
      .then(j => {
        if (cancelled) return;
        if (j?.success) {
          cache.set(url, j);
          setDataState(j as T);
        } else {
          setError('Failed to load.');
        }
      })
      .catch(e => {
        if (cancelled) return;
        // A 403 means this user may not see it, so also drop anything cached.
        if (e instanceof Error && e.message === 'Forbidden') cache.delete(url);
        setError(e instanceof Error && e.message === 'Forbidden' ? 'Forbidden' : 'Network error.');
      });
    return () => { cancelled = true; };
  }, [url]);

  return { data, setData, error };
}
