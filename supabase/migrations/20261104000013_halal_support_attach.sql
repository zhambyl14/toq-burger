-- 1) TOK BURGER is fully halal: no bacon anywhere in the menu.
update public.products
set description = 'Две говяжьи котлеты, расплавленный сыр, маринованные огурцы, салат и фирменный соус на булочке с кунжутом.',
    ingredients = array_remove(ingredients, 'Бекон')
where slug = 'classic';
update public.products
set description = regexp_replace(description, '\s*,?\s*бекон[а-я]*', '', 'gi')
where description ~* 'бекон';
update public.products set ingredients = array_remove(array_remove(ingredients, 'Бекон'), 'бекон')
where 'Бекон' = any(ingredients) or 'бекон' = any(ingredients);

-- 2) Support: a message may reference an order ("share the order into the chat").
alter table public.support_messages add column order_id uuid references public.orders(id) on delete set null;

create or replace function public.support_message_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.support_requests;
begin
  new.author_name := public.person_name(new.author_id);
  new.author_role := public.primary_role(new.author_id);
  new.created_at := now();
  select * into r from public.support_requests where id = new.request_id;
  -- requester may attach only own orders (customer) / delivered-by-me orders (courier); staff any order
  if new.order_id is not null and not public.is_backoffice() and not exists (
       select 1 from public.orders o where o.id = new.order_id and (o.user_id = new.author_id or o.courier_id = new.author_id)) then
    raise exception 'ORDER_NOT_YOURS';
  end if;
  if public.is_backoffice() and new.author_id <> r.user_id then
    update public.support_requests set updated_at = now(),
      status = case when status = 'OPEN' then 'IN_PROGRESS' else status end
    where id = new.request_id;
    if coalesce(new.order_id, r.order_id) is not null then
      perform public.add_order_event(coalesce(new.order_id, r.order_id), 'SUPPORT_REPLY', 'Ответ поддержки: ' || left(new.body, 200));
    end if;
  else
    update public.support_requests set updated_at = now(),
      status = case when status = 'IN_PROGRESS' then 'OPEN' else status end,
      -- a general thread becomes linked to the first order the requester shares
      order_id = coalesce(order_id, new.order_id)
    where id = new.request_id;
  end if;
  return new;
end $$;

-- 3) Status changes also bump updated_at (list ordering in the back office).
create or replace function public.support_touch() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then new.updated_at := now(); end if;
  return new;
end $$;
create trigger trg_support_touch before update on public.support_requests
  for each row execute function public.support_touch();
