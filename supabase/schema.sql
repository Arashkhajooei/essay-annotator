-- ============================================================
-- Essay Annotator — full database setup
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'annotator' check (role in ('admin', 'annotator')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ---------- labels ----------
create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#0095f6',
  description text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.labels enable row level security;

-- ---------- essays ----------
create table if not exists public.essays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  prompt text,
  content text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.essays enable row level security;

-- ---------- annotations (character-offset spans) ----------
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  essay_id uuid not null references public.essays (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete restrict,
  start_offset int not null check (start_offset >= 0),
  end_offset int not null check (end_offset > start_offset),
  text text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists annotations_essay_user_idx on public.annotations (essay_id, user_id);
create index if not exists annotations_user_idx on public.annotations (user_id);
create index if not exists annotations_label_idx on public.annotations (label_id);

alter table public.annotations enable row level security;

-- ---------- essay_submissions (a user marks an essay as done) ----------
create table if not exists public.essay_submissions (
  essay_id uuid not null references public.essays (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key (essay_id, user_id)
);

alter table public.essay_submissions enable row level security;

-- ---------- helper: is_admin ----------
-- SECURITY DEFINER so it can read profiles without recursive RLS.
-- It only ever reveals whether the CALLER is an admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ---------- trigger: create profile on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- trigger: only admins may change roles ----------
-- auth.uid() is null when run from the SQL editor or with the secret key,
-- so server-side maintenance still works.
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- ---------- trigger: keep updated_at fresh ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists essays_touch on public.essays;
create trigger essays_touch before update on public.essays
  for each row execute function public.touch_updated_at();

drop trigger if exists annotations_touch on public.annotations;
create trigger annotations_touch before update on public.annotations
  for each row execute function public.touch_updated_at();

-- ---------- RLS policies ----------
-- profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- labels: everyone reads, admins write
drop policy if exists "labels_select_all" on public.labels;
create policy "labels_select_all" on public.labels
  for select to authenticated
  using (true);

drop policy if exists "labels_insert_admin" on public.labels;
create policy "labels_insert_admin" on public.labels
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "labels_update_admin" on public.labels;
create policy "labels_update_admin" on public.labels
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "labels_delete_admin" on public.labels;
create policy "labels_delete_admin" on public.labels
  for delete to authenticated
  using (public.is_admin());

-- essays: everyone reads, creator or admin writes
drop policy if exists "essays_select_all" on public.essays;
create policy "essays_select_all" on public.essays
  for select to authenticated
  using (true);

drop policy if exists "essays_insert_own" on public.essays;
create policy "essays_insert_own" on public.essays
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists "essays_update_creator_or_admin" on public.essays;
create policy "essays_update_creator_or_admin" on public.essays
  for update to authenticated
  using (created_by = (select auth.uid()) or public.is_admin())
  with check (created_by = (select auth.uid()) or public.is_admin());

drop policy if exists "essays_delete_creator_or_admin" on public.essays;
create policy "essays_delete_creator_or_admin" on public.essays
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_admin());

-- annotations: each user owns theirs; admins can read everything for export
drop policy if exists "annotations_select_own_or_admin" on public.annotations;
create policy "annotations_select_own_or_admin" on public.annotations
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "annotations_insert_own" on public.annotations;
create policy "annotations_insert_own" on public.annotations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "annotations_update_own" on public.annotations;
create policy "annotations_update_own" on public.annotations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "annotations_delete_own" on public.annotations;
create policy "annotations_delete_own" on public.annotations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- essay_submissions
drop policy if exists "submissions_select_own_or_admin" on public.essay_submissions;
create policy "submissions_select_own_or_admin" on public.essay_submissions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "submissions_insert_own" on public.essay_submissions;
create policy "submissions_insert_own" on public.essay_submissions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "submissions_delete_own" on public.essay_submissions;
create policy "submissions_delete_own" on public.essay_submissions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- grants (Data API access; RLS controls rows) ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- seed: the 7 rhetorical-move labels ----------
insert into public.labels (name, color, description, sort_order) values
  ('Lead',                 '#4FC3F7', 'Hook / intro that grabs reader attention', 1),
  ('Position',             '#BA68C8', 'The author''s central stance on the topic', 2),
  ('Claim',                '#81C784', 'A specific assertion supporting the position', 3),
  ('Counterclaim',         '#FF8A65', 'An opposing view raised by the author', 4),
  ('Rebuttal',             '#F06292', 'The author''s response refuting the counterclaim', 5),
  ('Evidence',             '#FFD54F', 'Facts / examples / quotes supporting a claim', 6),
  ('Concluding Statement', '#90A4AE', 'Final summary / synthesis', 7)
on conflict (name) do nothing;

-- ---------- backfill profiles for users created before this script ----------
insert into public.profiles (id, email, display_name)
select u.id, u.email,
       coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- ---------- make the project owner an admin ----------
update public.profiles
set role = 'admin'
where email = 'arash.khajooei@gmail.com';

-- ---------- seed: two sample TOEFL-style essays ----------
insert into public.essays (title, prompt, content)
select
  'Technology and Face-to-Face Communication',
  'Do you agree or disagree with the following statement? Technology has made it easier for people to communicate, but it has reduced the quality of face-to-face interaction. Use specific reasons and examples to support your answer.',
  'Imagine a family dinner where every member is staring at a glowing screen instead of talking to one another. Scenes like this have become so common that many people wonder whether our devices are quietly eroding the art of conversation.

I firmly believe that although technology has multiplied the channels through which we communicate, it has indeed weakened the depth and quality of our face-to-face interactions.

First of all, constant connectivity encourages shallow exchanges rather than meaningful dialogue. When people can send a quick emoji or a three-word text, they often choose that over a long, thoughtful conversation. A study by the Pew Research Center found that nearly 90 percent of teenagers prefer texting to talking, and many admit they feel anxious during in-person conversations.

Admittedly, some argue that technology actually enhances face-to-face communication because video calls allow distant relatives and colleagues to see each other regularly. They point out that grandparents can now watch their grandchildren grow up across continents.

However, this argument confuses frequency with quality. Seeing a pixelated face on a screen cannot replicate the warmth of shared physical presence, the subtle body language, or the spontaneous moments that arise when people occupy the same room. Video calls are scheduled and framed; real conversations are organic.

Furthermore, the habit of multitasking with devices during in-person meetings sends a clear message that the person in front of us is less important than whatever is happening online. In my own experience, group projects at university suffered whenever members kept checking their phones, and our discussions became fragmented and unproductive.

In conclusion, while technology has undeniably expanded the quantity of human communication, it has diluted its quality. Unless we consciously set our devices aside, we risk becoming a society that is endlessly connected yet profoundly alone.'
where not exists (
  select 1 from public.essays where title = 'Technology and Face-to-Face Communication'
);

insert into public.essays (title, prompt, content)
select
  'Should University Education Be Free?',
  'Some people believe that university education should be free for all students. Others think students should pay for their own education. Which view do you agree with? Use specific reasons and examples to support your answer.',
  'Every spring, millions of students around the world receive university acceptance letters with one hand and tuition bills with the other. For many families, that second envelope decides whether the first one matters at all.

In my view, university education should be free for all qualified students, because society as a whole reaps the rewards of an educated population.

The clearest benefit of free higher education is that it unlocks talent regardless of family income. Brilliant students from poor households are currently filtered out not by ability but by price.

For example, countries such as Germany and Norway abolished tuition fees and have seen enrollment from low-income families rise significantly, while their economies continue to rank among the most innovative in Europe.

Opponents of free tuition argue that it places an unfair burden on taxpayers, many of whom never attended university themselves and should not have to subsidize those who do.

This objection overlooks the fact that taxpayers already benefit enormously from the doctors, engineers, and teachers that universities produce. An educated workforce pays higher income taxes over a lifetime, commits fewer crimes, and depends less on social welfare, so the initial public investment is repaid many times over.

In addition, graduates burdened by heavy student loans often delay buying homes, starting families, and launching businesses, which slows the entire economy. Removing tuition fees would free an entire generation to take productive risks instead of servicing debt.

To sum up, free university education is not a luxury but a long-term investment in national prosperity. Societies that treat education as a public good, rather than a private commodity, will be the ones that thrive in the coming century.'
where not exists (
  select 1 from public.essays where title = 'Should University Education Be Free?'
);

-- Done. Reload the app and click "Re-check" — it should come alive.
