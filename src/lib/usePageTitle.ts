import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · СЛОВО` : 'СЛОВО · 俄语提背';
  }, [title]);
}
