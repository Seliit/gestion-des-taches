-- Listes : une note facultative sur chaque ligne. Relançable sans risque.
alter table public.quick_list_items add column if not exists note text check (note is null or char_length(note) <= 4000);
notify pgrst, 'reload schema';
