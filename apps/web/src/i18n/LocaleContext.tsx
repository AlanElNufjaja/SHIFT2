import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@fieldshift/core';

const STORAGE_KEY = 'fieldshift.locale';

const DOC_TITLES: Record<Locale, string> = {
  en: 'Field Shift — Farm Decision Guide with NASA Data',
  es: 'Field Shift — Adaptación Agrícola con Datos NASA',
};

function readInitialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'es') return 'es';
  } catch {
    // Ignore storage access restrictions
  }
  return 'en';
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = DOC_TITLES[locale];
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore storage access restrictions
    }
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale: setLocaleState }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return { locale: 'en', setLocale: () => undefined };
  }
  return ctx;
}
