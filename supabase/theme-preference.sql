-- Per-user light/dark theme preference. Single source of truth in the DB so the
-- choice follows the user across devices (localStorage is only the no-flash cache).
-- 'light' | 'dark' | null (null = not chosen yet -> app default, which is dark).
alter table public.profiles
  add column if not exists theme text;
