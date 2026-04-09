export type Locale = 'en' | 'de';

export function localizePath(locale: Locale, href: string) {
  if (locale === 'en') return href;
  return href === '/' ? '/de' : `/de${href}`;
}
