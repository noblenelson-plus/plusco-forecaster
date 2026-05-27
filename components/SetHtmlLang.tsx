"use client";

import { useEffect } from 'react';

export default function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      try {
        document.documentElement.lang = lang || 'en';
      } catch (e) {
        // ignore
      }
    }
  }, [lang]);

  return null;
}
