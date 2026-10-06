import { useEffect, useState } from 'react';

// Loads one staff endpoint when the page mounts (and again if `url` changes).
// `setData` is exposed for optimistic updates, e.g. removing a row after an
// approve/reject so the list doesn't need a refetch.
export function useStaffData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    fetch(url)
      .then(r => {
        if (r.status === 403) throw new Error('Forbidden');
        return r.json();
      })
      .then(j => {
        if (cancelled) return;
        if (j?.success) setData(j as T);
        else setError('Failed to load.');
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error && e.message === 'Forbidden' ? 'Forbidden' : 'Network error.');
      });
    return () => { cancelled = true; };
  }, [url]);

  return { data, setData, error };
}
