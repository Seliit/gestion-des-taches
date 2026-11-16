-- =====================================================================
-- Accueil : « Stock à perte » modifiable (stock vendu à perte, prix de déstockage).
-- Réservé aux super-admins (Pierre et Raph). Relançable sans doublon.
-- =====================================================================

create table if not exists public.loss_stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  qty int check (qty is null or qty > 0),                  -- vide = lot (ex. produits ménagers), non compté dans les articles
  unit_price numeric(10,2) check (unit_price is null or unit_price >= 0),
  amount numeric(10,2) check (amount is null or amount >= 0), -- montant total saisi à la main (sinon qté × prix)
  sold int not null default 0,                              -- quantité déjà vendue
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loss_stock_sold_range check (sold >= 0 and sold <= coalesce(qty, 1))
);

drop trigger if exists trg_loss_stock_touch on public.loss_stock_items;
create trigger trg_loss_stock_touch before update on public.loss_stock_items
  for each row execute function public.touch_updated_at();

alter table public.loss_stock_items enable row level security;
revoke all on public.loss_stock_items from anon;
grant select, insert, update, delete on public.loss_stock_items to authenticated;

drop policy if exists loss_stock_all on public.loss_stock_items;
create policy loss_stock_all on public.loss_stock_items for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

do $$
begin
  alter publication supabase_realtime add table public.loss_stock_items;
exception when others then
  raise notice 'Publication temps réel non modifiée : %', sqlerrm;
end $$;

-- Liste de départ (16/11/2026), seulement si la table est vide.
insert into public.loss_stock_items (name, qty, unit_price, amount, position)
select v.name, v.qty, v.unit_price, v.amount, v.position
from (values
  ('Jeux de société Scooby-Doo', 10, 6.00, null::numeric, 1),
  ('Barbie', 11, 16.50, null, 2),
  ('Crayola', 14, 2.99, null, 3),
  ('Doudou', 1, 9.00, null, 4),
  ('Tournevis Makita', 15, 7.50, null, 5),
  ('Jeux vidéo', 8, 7.50, null, 6),
  ('Playmobil', 1, 5.00, null, 7),
  ('Plaques Lagrange', 4, 25.00, null, 8),
  ('Figurines Pop', 10, 5.99, null, 9),
  ('Produits ménagers', null, null, 40.00, 10)
) as v(name, qty, unit_price, amount, position)
where not exists (select 1 from public.loss_stock_items);

notify pgrst, 'reload schema';
