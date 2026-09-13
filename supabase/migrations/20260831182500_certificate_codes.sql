alter table public.exam_attempts
  add column if not exists certificate_code text;

create unique index if not exists exam_attempts_certificate_code_uidx
  on public.exam_attempts (certificate_code)
  where certificate_code is not null;

create or replace function public.make_certificate_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  raw text;
begin
  raw := upper(replace(gen_random_uuid()::text, '-', ''));
  return substr(raw, 1, 6) || '-' || substr(raw, 7, 6) || '-' || substr(raw, 13, 6);
end;
$$;

create or replace function public.assign_exam_attempt_certificate_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.passed is true and (new.certificate_code is null or btrim(new.certificate_code) = '') then
    loop
      new.certificate_code := public.make_certificate_code();
      exit when not exists (
        select 1
        from public.exam_attempts ea
        where ea.certificate_code = new.certificate_code
      );
    end loop;
  elsif new.passed is not true then
    new.certificate_code := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_exam_attempt_certificate_code on public.exam_attempts;
create trigger trg_assign_exam_attempt_certificate_code
before insert or update of passed, certificate_code on public.exam_attempts
for each row execute function public.assign_exam_attempt_certificate_code();

do $$
declare
  r record;
  c text;
begin
  for r in
    select id
    from public.exam_attempts
    where passed is true
      and certificate_code is null
  loop
    loop
      c := public.make_certificate_code();
      exit when not exists (
        select 1
        from public.exam_attempts
        where certificate_code = c
      );
    end loop;

    update public.exam_attempts
    set certificate_code = c
    where id = r.id;
  end loop;
end $$;
