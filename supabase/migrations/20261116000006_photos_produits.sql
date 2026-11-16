-- =====================================================================
-- Tableau « Idées produits » : plusieurs photos par carte (façon Trello).
-- Fichiers PRIVÉS dans le bucket product-photos, chemin {company_id}/{card_id}/{fichier}.
-- Seuls les membres de la société (et les super-admins) peuvent les voir, ajouter ou supprimer.
-- =====================================================================

alter table public.product_cards add column if not exists photos text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif'])
on conflict (id) do nothing;

drop policy if exists "product_photos_read" on storage.objects;
drop policy if exists "product_photos_upload" on storage.objects;
drop policy if exists "product_photos_delete" on storage.objects;

create policy "product_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and public.is_company_member(public.storage_company_id(name)));

create policy "product_photos_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos'
              and public.is_company_member(public.storage_company_id(name))
              and exists (select 1 from public.product_cards c
                          where c.id = public.storage_task_id(name)
                            and c.company_id = public.storage_company_id(name)));

create policy "product_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_company_member(public.storage_company_id(name)));

-- Recharge le cache de l'API pour que l'app voie tout de suite la nouvelle colonne.
notify pgrst, 'reload schema';
