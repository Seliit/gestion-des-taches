-- Idées produits : quantité sur chaque carte (facultative). Relançable sans risque.
alter table public.product_cards add column if not exists quantity int check (quantity is null or quantity >= 0);
notify pgrst, 'reload schema';
