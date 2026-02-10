
'use client';

import { useState, useEffect } from 'react';

export type Translation = Record<string, string>;

const DEFAULT_LOCALE = 'en-US';

export function useStremioTranslation(locale: string = DEFAULT_LOCALE) {
  const [translations, setTranslations] = useState<Translation>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If locale is default or empty, try to load en-US first
    const targetLocale = locale || DEFAULT_LOCALE;
    
    setLoading(true);
    fetch(`/locales/${targetLocale}.json`)
        .then(res => {
            if (!res.ok) throw new Error(`Failed to load locale: ${targetLocale}`);
            return res.json();
        })
        .then(data => {
            setTranslations(data);
        })
        .catch(err => {
            console.error(err);
            // Fallback to en-US if failed
            if (targetLocale !== DEFAULT_LOCALE) {
                fetch(`/locales/${DEFAULT_LOCALE}.json`)
                    .then(r => r.json())
                    .then(d => setTranslations(d))
                    .catch(e => console.error('Fallback failed', e));
            }
        })
        .finally(() => setLoading(false));
  }, [locale]);

  return { t: translations, loading };
}
