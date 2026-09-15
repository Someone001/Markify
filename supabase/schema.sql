-- 1. Students Table
create table students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  roll_no text unique not null,
  embedding float8[] not null,
  created_at timestamptz default now()
);

-- 2. Sessions Table
create table sessions (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 3. Attendance Status Enum
create type attendance_status as enum ('present', 'flagged_duplicate', 'manual_override', 'manual_fallback');

-- 4. Attendance Table
create table attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id),
  session_id uuid references sessions(id),
  timestamp timestamptz default now(),
  confidence float,
  status attendance_status not null,
  overridden_by uuid references auth.users(id),
  hash text not null,
  prev_hash text,
  created_at timestamptz default now()
);

-- 5. Enable Row Level Security (RLS)
alter table students enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;

-- 6. RLS Policies (Authenticated users can read and write)

-- Students policies
create policy "Authenticated users can read students"
  on students for select
  to authenticated
  using (true);

create policy "Authenticated users can insert students"
  on students for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update students"
  on students for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete students"
  on students for delete
  to authenticated
  using (true);

-- Sessions policies
create policy "Authenticated users can read sessions"
  on sessions for select
  to authenticated
  using (true);

create policy "Authenticated users can insert sessions"
  on sessions for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update sessions"
  on sessions for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete sessions"
  on sessions for delete
  to authenticated
  using (true);

-- Attendance policies
create policy "Authenticated users can read attendance"
  on attendance for select
  to authenticated
  using (true);

create policy "Authenticated users can insert attendance"
  on attendance for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update attendance"
  on attendance for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete attendance"
  on attendance for delete
  to authenticated
  using (true);
