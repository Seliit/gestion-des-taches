-- =====================================================================
-- Tableau « Idées produits » (revente Amazon FBA), façon Trello, par société.
-- Colonnes libres (ajout / renommage / ordre / suppression) et cartes produit.
-- Accès : membres actifs de la société (et super-admins), jamais anonyme.
-- =====================================================================

create type public.product_verdict as enum ('bon', 'moyen', 'a_eviter');

create table public.product_columns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position double precision not null default 0,
  is_store boolean not null default false,      -- colonne « magasin » (liste de courses)
  is_protected boolean not null default false,  -- suppression avec double confirmation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);
create index product_columns_company_idx on public.product_columns (company_id, position);

create table public.product_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  column_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  image_url text,
  ean text,
  asin text,
  amazon_url text,
  supplier_url text,
  buy_price numeric(10, 2),
  sell_price numeric(10, 2),
  amazon_fees numeric(10, 2),
  profit numeric(10, 2),
  roi numeric(9, 2),
  monthly_sales integer,
  bsr integer,
  notes text,
  received_at timestamptz,
  verdict public.product_verdict,
  in_cart boolean not null default false,        -- coché dans la liste de courses
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- la colonne doit appartenir à la même société
  foreign key (column_id, company_id) references public.product_columns (id, company_id) on delete cascade
);
create index product_cards_column_idx on public.product_cards (column_id);
create index product_cards_company_idx on public.product_cards (company_id);

create trigger trg_product_columns_touch before update on public.product_columns
  for each row execute function public.touch_updated_at();
create trigger trg_product_cards_touch before update on public.product_cards
  for each row execute function public.touch_updated_at();

alter table public.product_columns enable row level security;
alter table public.product_cards enable row level security;

revoke all on public.product_columns, public.product_cards from anon;
grant select, insert, update, delete on public.product_columns, public.product_cards to authenticated;

create policy product_columns_all on public.product_columns for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy product_cards_all on public.product_cards for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

-- Temps réel : les changements apparaissent chez tout le monde sans recharger.
do $$
begin
  alter publication supabase_realtime add table public.product_cards, public.product_columns;
exception when others then
  raise notice 'Publication temps réel non modifiée : %', sqlerrm;
end $$;
