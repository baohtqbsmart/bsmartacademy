-- =============================================================================
-- LOCAL DEVELOPMENT SEED — fictional people only.
--
-- Every name, email (reserved .test domain) and phone number (0900 000 xxx)
-- below is invented. Runs on `supabase db reset`; never run against production.
-- All accounts share the password:  BSmart@2026
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auth accounts (profiles are created by the on_auth_user_created trigger)
-- -----------------------------------------------------------------------------
do $$
declare
  account record;
  user_id uuid;
begin
  for account in
    select * from (values
      ('superadmin@bsmart.test', 'Đặng Minh Khoa',        'super_admin', true),
      ('admin@bsmart.test',      'Nguyễn Thị Thu Trang',  'admin',       true),
      ('gv.hung@bsmart.test',    'Lê Văn Hùng',           'teacher',     true),
      ('gv.ha@bsmart.test',      'Phạm Thu Hà',           'teacher',     true),
      ('gv.tuan@bsmart.test',    'Võ Minh Tuấn',          'teacher',     true),
      ('gv.vinh@bsmart.test',    'Mai Quang Vinh',        'teacher',     false),
      ('ph.lan@bsmart.test',     'Bùi Thị Lan',           'parent',      true),
      ('ph.duc@bsmart.test',     'Hoàng Văn Đức',         'parent',      true),
      ('hs.huy@bsmart.test',     'Nguyễn Gia Huy',        'student',     true),
      ('hs.chau@bsmart.test',    'Hoàng Minh Châu',       'student',     true),
      ('hs.khang@bsmart.test',   'Trương Bảo Khang',      'student',     true)
    ) as t (email, full_name, role, active)
  loop
    user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated',
      account.email, extensions.crypt('BSmart@2026', extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', account.role),
      jsonb_build_object('full_name', account.full_name),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), user_id::text, user_id,
      jsonb_build_object('sub', user_id::text, 'email', account.email, 'email_verified', true),
      'email', now(), now(), now()
    );

    if not account.active then
      update public.profiles set is_active = false where id = user_id;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Teachers
-- -----------------------------------------------------------------------------
insert into public.teachers (teacher_code, full_name, phone, email, hired_on, status, profile_id)
select t.code, t.full_name, t.phone, t.email, t.hired_on::date, t.status::public.staff_status,
       (select id from auth.users u where u.email = t.email)
from (values
  ('GV001', 'Lê Văn Hùng',    '0900000101', 'gv.hung@bsmart.test', '2022-08-01', 'active'),
  ('GV002', 'Phạm Thu Hà',    '0900000102', 'gv.ha@bsmart.test',   '2021-09-06', 'active'),
  ('GV003', 'Võ Minh Tuấn',   '0900000103', 'gv.tuan@bsmart.test', '2024-02-19', 'active'),
  ('GV004', 'Mai Quang Vinh', '0900000104', 'gv.vinh@bsmart.test', '2020-08-10', 'inactive')
) as t (code, full_name, phone, email, hired_on, status);

insert into public.teacher_qualifications (teacher_id, title, institution, year_awarded)
select t.id, q.title, q.institution, q.year
from (values
  ('GV001', 'Cử nhân Sư phạm Toán',        'Trường Đại học Sư phạm (hư cấu)', 2015),
  ('GV002', 'Cử nhân Ngôn ngữ Anh',        'Trường Đại học Ngoại ngữ (hư cấu)', 2013),
  ('GV002', 'Cambridge CELTA',             'Cambridge English (ví dụ)',        2018),
  ('GV003', 'IELTS Academic 7.5',          'IDP / British Council (ví dụ)',    2023),
  ('GV004', 'Cử nhân Sư phạm Vật lý',      'Trường Đại học Sư phạm (hư cấu)', 2011)
) as q (teacher_code, title, institution, year)
join public.teachers t on t.teacher_code = q.teacher_code;

-- -----------------------------------------------------------------------------
-- Students (some young students have no login account)
-- -----------------------------------------------------------------------------
insert into public.students (student_code, full_name, date_of_birth, gender, school_name, profile_id)
select s.code, s.full_name, s.dob::date, s.gender::public.gender, s.school,
       (select id from auth.users u where u.email = s.email)
from (values
  ('HS001', 'Nguyễn Gia Huy',   '2014-03-12', 'male',   'THCS Hoa Mai',   'hs.huy@bsmart.test'),
  ('HS002', 'Nguyễn Ngọc Anh',  '2016-07-25', 'female', 'Tiểu học Sơn Ca', null),
  ('HS003', 'Hoàng Minh Châu',  '2014-11-02', 'female', 'THCS Hoa Mai',   'hs.chau@bsmart.test'),
  ('HS004', 'Trương Bảo Khang', '2013-05-30', 'male',   'THCS Đồi Thông', 'hs.khang@bsmart.test'),
  ('HS005', 'Đỗ Phương Linh',   '2016-01-18', 'female', 'Tiểu học Sơn Ca', null),
  ('HS006', 'Lý Thanh Tâm',     '2014-09-09', 'male',   'THCS Hoa Mai',   null)
) as s (code, full_name, dob, gender, school, email);

-- Contact details, admission dates and English levels (all fictional).
update public.students s
set phone = d.phone, email = d.email, address = d.address, joined_on = d.joined_on::date,
    english_level_code = d.level, target_level_code = d.target
from (values
  ('HS001', '0900000301', 'hs.huy@bsmart.test',   '12 Đường Hoa Hồng, Phường 1', '2025-08-20', 'CAM_KET',    'CAM_PET'),
  ('HS002', null,         null,                   '12 Đường Hoa Hồng, Phường 1', '2026-08-26', 'CAM_MOVERS', 'CAM_FLYERS'),
  ('HS003', '0900000303', 'hs.chau@bsmart.test',  '45 Đường Thông Xanh, Phường 3', '2026-08-27', 'A2',         'B1'),
  ('HS004', '0900000304', 'hs.khang@bsmart.test', '8 Đường Đồi Cát, Phường 5',   '2026-08-26', 'PRE_IELTS',  'IELTS_5.5'),
  ('HS005', null,         null,                   '30 Đường Sương Mai, Phường 2', '2026-08-28', 'CAM_STARTERS', 'CAM_MOVERS'),
  ('HS006', null,         null,                   null,                           '2026-08-29', null,         null)
) as d (code, phone, email, address, joined_on, level, target)
where s.student_code = d.code;

-- A record entered by mistake and archived.
update public.students set deleted_at = now() where student_code = 'HS006';

-- -----------------------------------------------------------------------------
-- Parents and links
-- -----------------------------------------------------------------------------
insert into public.parents (full_name, phone, email, profile_id)
select p.full_name, p.phone, p.email, (select id from auth.users u where u.email = p.email)
from (values
  ('Bùi Thị Lan',     '0900000201', 'ph.lan@bsmart.test'),
  ('Nguyễn Văn Phúc', '0900000202', null),
  ('Hoàng Văn Đức',   '0900000203', 'ph.duc@bsmart.test'),
  ('Đỗ Văn Nam',      '0900000204', null)
) as p (full_name, phone, email);

insert into public.student_parents (student_id, parent_id, relationship, is_primary_contact)
select s.id, p.id, l.relationship::public.guardian_relationship, l.is_primary
from (values
  ('HS001', 'Bùi Thị Lan',     'mother', true),
  ('HS001', 'Nguyễn Văn Phúc', 'father', false),
  ('HS002', 'Bùi Thị Lan',     'mother', true),
  ('HS002', 'Nguyễn Văn Phúc', 'father', false),
  ('HS003', 'Hoàng Văn Đức',   'father', true),
  ('HS005', 'Đỗ Văn Nam',      'father', true)
) as l (student_code, parent_name, relationship, is_primary)
join public.students s on s.student_code = l.student_code
join public.parents p on p.full_name = l.parent_name;

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------
insert into public.subjects (code, name, description) values
  ('TOAN', 'Toán học',  'Toán THCS và nâng cao'),
  ('ANH',  'Tiếng Anh', 'Tiếng Anh thiếu nhi và Cambridge');

insert into public.levels (subject_id, code, name, sort_order)
select sub.id, l.code, l.name, l.sort_order
from (values
  ('TOAN', 'L6',     'Lớp 6',            6),
  ('TOAN', 'L7',     'Lớp 7',            7),
  ('ANH',  'FLYERS', 'Cambridge Flyers', 3),
  ('ANH',  'KET',    'Cambridge KET (A2)', 4)
) as l (subject_code, code, name, sort_order)
join public.subjects sub on sub.code = l.subject_code;

insert into public.courses (code, name, description, subject_id, level_id, session_count, session_minutes, duration_weeks, status)
select c.code, c.name, c.description, sub.id, lvl.id, c.sessions, c.minutes, c.sessions / 2, 'active'
from (values
  ('TOAN6-NC',   'Toán nâng cao lớp 6',        'Củng cố và nâng cao chương trình Toán lớp 6.', 'TOAN', 'L6',     48, 90),
  ('ANH-FLYERS', 'Tiếng Anh Cambridge Flyers', 'Luyện kỹ năng và thi Cambridge Flyers.',      'ANH',  'FLYERS', 60, 90),
  ('ANH-KET',    'Luyện thi Cambridge KET',    'Ôn luyện bốn kỹ năng cho kỳ thi KET.',        'ANH',  'KET',    48, 90)
) as c (code, name, description, subject_code, level_code, sessions, minutes)
join public.subjects sub on sub.code = c.subject_code
join public.levels lvl on lvl.subject_id = sub.id and lvl.code = c.level_code;

-- -----------------------------------------------------------------------------
-- Classes, teacher assignments and enrolments
-- -----------------------------------------------------------------------------
insert into public.classes (code, name, course_id, status, start_date, end_date, capacity, room)
select c.code, c.name, co.id, c.status::public.class_status, c.start_date::date, c.end_date::date, c.capacity, c.room
from (values
  ('TOAN6-2026A', 'Toán 6 nâng cao – 2026A', 'TOAN6-NC',   'active',    '2026-09-07', '2027-05-28', 12, 'P101'),
  ('FLY-2026A',   'Flyers – 2026A',          'ANH-FLYERS', 'active',    '2026-09-07', '2027-06-25', 10, 'P202'),
  ('KET-2025B',   'KET – 2025B',             'ANH-KET',    'completed', '2025-09-08', '2026-05-29', 10, 'P202')
) as c (code, name, course_code, status, start_date, end_date, capacity, room)
join public.courses co on co.code = c.course_code;

insert into public.class_schedule_slots (class_id, weekday, starts_at, ends_at)
select cl.id, s.weekday, s.starts_at::time, s.ends_at::time
from (values
  ('TOAN6-2026A', 2, '18:00', '19:30'),
  ('TOAN6-2026A', 4, '18:00', '19:30'),
  ('FLY-2026A',   1, '17:30', '19:00'),
  ('FLY-2026A',   3, '17:30', '19:00'),
  ('KET-2025B',   6, '08:00', '09:30')
) as s (class_code, weekday, starts_at, ends_at)
join public.classes cl on cl.code = s.class_code;

insert into public.class_members (class_id, teacher_id, member_role, assigned_on)
select cl.id, t.id, m.member_role::public.class_member_role, cl.start_date
from (values
  ('TOAN6-2026A', 'GV001', 'lead_teacher'),
  ('FLY-2026A',   'GV002', 'lead_teacher'),
  ('FLY-2026A',   'GV003', 'assistant_teacher'),
  ('KET-2025B',   'GV002', 'lead_teacher')
) as m (class_code, teacher_code, member_role)
join public.classes cl on cl.code = m.class_code
join public.teachers t on t.teacher_code = m.teacher_code;

insert into public.enrollments (student_id, class_id, status, enrolled_on, ended_on)
select s.id, cl.id, e.status::public.enrollment_status, e.enrolled_on::date, e.ended_on::date
from (values
  ('HS001', 'TOAN6-2026A', 'active',    '2026-08-25', null),
  ('HS001', 'KET-2025B',   'completed', '2025-09-01', '2026-05-29'),
  ('HS002', 'FLY-2026A',   'active',    '2026-08-26', null),
  ('HS003', 'TOAN6-2026A', 'active',    '2026-08-27', null),
  ('HS004', 'FLY-2026A',   'withdrawn', '2026-08-26', '2026-09-20'),
  ('HS005', 'FLY-2026A',   'active',    '2026-08-28', null),
  ('HS006', 'TOAN6-2026A', 'active',    '2026-08-29', null)
) as e (student_code, class_code, status, enrolled_on, ended_on)
join public.students s on s.student_code = e.student_code
join public.classes cl on cl.code = e.class_code;

-- -----------------------------------------------------------------------------
-- Teacher feedback (written "as" each teacher so the author trigger records them)
-- -----------------------------------------------------------------------------
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('gv.hung@bsmart.test', 'HS001', 'Huy nắm vững phân số, cần luyện thêm bài toán có lời văn.'),
      ('gv.hung@bsmart.test', 'HS003', 'Châu làm bài cẩn thận, tích cực phát biểu trong giờ học.'),
      ('gv.ha@bsmart.test',   'HS002', 'Ngọc Anh phát âm tốt, nên đọc thêm truyện tranh tiếng Anh ở nhà.')
    ) as t (author_email, student_code, body)
  loop
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', (select id from auth.users where email = item.author_email))::text,
      false
    );
    insert into public.student_feedback (student_id, body)
    select id, item.body from public.students where student_code = item.student_code;
  end loop;
  perform set_config('request.jwt.claims', '', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Subjects taught and course structures
-- -----------------------------------------------------------------------------
insert into public.teacher_subjects (teacher_id, subject_id)
select t.id, s.id
from (values ('GV001', 'TOAN'), ('GV002', 'ANH'), ('GV003', 'ANH')) as ts (teacher_code, subject_code)
join public.teachers t on t.teacher_code = ts.teacher_code
join public.subjects s on s.code = ts.subject_code;

insert into public.course_units (course_id, position, title, description, session_count)
select c.id, u.position, u.title, u.description, u.sessions
from (values
  ('TOAN6-NC',   1, 'Số tự nhiên và phép chia hết', 'Ôn tập, dấu hiệu chia hết, số nguyên tố.', 12),
  ('TOAN6-NC',   2, 'Phân số và số thập phân',      'Các phép tính, bài toán có lời văn.',     14),
  ('TOAN6-NC',   3, 'Hình học trực quan',           'Hình phẳng, chu vi, diện tích.',          12),
  ('TOAN6-NC',   4, 'Ôn tập và kiểm tra',           'Đề tổng hợp nâng cao.',                   10),
  ('ANH-FLYERS', 1, 'Vocabulary & Phonics',         'Chủ đề quen thuộc, phát âm.',             20),
  ('ANH-FLYERS', 2, 'Reading & Writing',            'Luyện các phần thi Reading & Writing.',   20),
  ('ANH-FLYERS', 3, 'Listening & Speaking',         'Luyện nghe, nói theo cặp, thi thử.',      20)
) as u (course_code, position, title, description, sessions)
join public.courses c on c.code = u.course_code;

-- -----------------------------------------------------------------------------
-- Tuition (fictional). Created through the same functions the app uses, as the
-- admin account, with due dates relative to today so statuses stay meaningful.
-- -----------------------------------------------------------------------------
insert into public.tuition_plans (code, name, course_id, amount, duration_months, payment_schedule)
select p.code, p.name, c.id, p.amount, p.months, p.schedule::public.payment_schedule
from (values
  ('TOAN6-9T',  'Toán 6 nâng cao – 9 tháng, đóng hàng tháng', 'TOAN6-NC',   12600000, 9,  'monthly'),
  ('FLYERS-Q',  'Flyers – 10 tháng, đóng theo quý',           'ANH-FLYERS', 15000000, 10, 'quarterly'),
  ('KET-1L',    'KET – đóng một lần',                         'ANH-KET',     9000000, 9,  'one_time')
) as p (code, name, course_code, amount, months, schedule)
join public.courses c on c.code = p.course_code;

insert into public.tuition_discount_rules (plan_id, name, kind, value)
values
  (null, 'Anh chị em ruột – giảm 10%', 'percent', 10),
  (null, 'Học bổng 1.000.000 ₫', 'fixed', 1000000),
  ((select id from public.tuition_plans where code = 'KET-1L'), 'Đóng trọn khóa – giảm 5%', 'percent', 5);

do $$
declare
  today date := private.academy_today();
  admin_id uuid := (select id from auth.users where email = 'admin@bsmart.test');
  plan_toan uuid := (select id from public.tuition_plans where code = 'TOAN6-9T');
  plan_fly uuid := (select id from public.tuition_plans where code = 'FLYERS-Q');
  sibling uuid := (select id from public.tuition_discount_rules where kind = 'percent' and value = 10);
  scholarship uuid := (select id from public.tuition_discount_rules where kind = 'fixed');
  huy uuid;
  ngoc_anh uuid;
  chau uuid;
  linh uuid;
  inv record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id)::text, false);

  huy := public.assign_tuition((select id from public.students where student_code = 'HS001'), plan_toan, today - 50);
  ngoc_anh := public.assign_tuition((select id from public.students where student_code = 'HS002'), plan_fly, today - 20, array[sibling]);
  chau := public.assign_tuition((select id from public.students where student_code = 'HS003'), plan_toan, today - 50);
  linh := public.assign_tuition((select id from public.students where student_code = 'HS005'), plan_fly, today - 10, array[scholarship]);

  -- Huy: first two monthly installments paid in full.
  for inv in select id, amount, due_date from public.invoices where student_tuition_id = huy order by due_date limit 2 loop
    perform public.record_payment(inv.id, inv.amount, least(inv.due_date, today), 'cash', null, 'Phụ huynh nộp tại quầy');
  end loop;

  -- Ngọc Anh: part of the first quarter paid by bank transfer (now overdue).
  perform public.record_payment(
    (select id from public.invoices where student_tuition_id = ngoc_anh order by due_date limit 1),
    2000000, today - 15, 'bank_transfer', 'CK-FAKE-000123', null
  );

  -- Linh: first quarter paid in full.
  select id, amount into inv from public.invoices where student_tuition_id = linh order by due_date limit 1;
  perform public.record_payment(inv.id, inv.amount, today - 5, 'bank_transfer', 'CK-FAKE-000456', null);

  -- Châu: nothing paid yet (two installments overdue).

  perform set_config('request.jwt.claims', '', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Attendance (fictional). Flyers is taught hybrid (some students join online).
-- Registers cover each class's scheduled days in the six weeks before today
-- (or before the class ended), taken through save_attendance as the lead
-- teacher, so the absence warnings stay current:
--   Châu (HS003) missed the last 3 Toán sessions, Ngọc Anh (HS002) the last 2
--   Flyers sessions; Huy was late once, Linh excused once.
-- -----------------------------------------------------------------------------
update public.classes
set delivery_mode = 'hybrid', meeting_url = 'https://meet.example.test/bsmart-fly-2026a'
where code = 'FLY-2026A';

do $$
declare
  today date := private.academy_today();
  register record;
  entries jsonb;
begin
  for register in
    select w.*,
           row_number() over (partition by w.class_id order by w.session_date desc) as recency
    from (
      select cl.id as class_id, cl.code, cl.start_date, d::date as session_date,
             (select t.profile_id from public.class_members cm join public.teachers t on t.id = cm.teacher_id
              where cm.class_id = cl.id and cm.member_role = 'lead_teacher') as teacher_profile
      from public.classes cl
      cross join lateral generate_series(
        greatest(cl.start_date, least(today - 1, cl.end_date) - 42),
        least(today - 1, cl.end_date),
        interval '1 day'
      ) d
      where cl.code in ('TOAN6-2026A', 'FLY-2026A', 'KET-2025B')
        and exists (
          select 1 from public.class_schedule_slots s
          where s.class_id = cl.id and s.weekday = extract(isodow from d)
        )
    ) w
  loop
    select jsonb_agg(jsonb_build_object(
      'student_id', x.student_id,
      'status', x.status,
      'minutes_late', case when x.status = 'late' then 10 end,
      'attended_via', case when x.status in ('present', 'late') and x.code = 'HS005' and register.recency % 2 = 0
                           then 'online' end,
      'note', case when x.status = 'excused' then 'Ốm, phụ huynh đã báo trước.' end
    ))
    into entries
    from (
      select s.id as student_id, s.student_code as code,
        case
          when s.student_code = 'HS003' and register.recency <= 3 then 'absent'
          when s.student_code = 'HS002' and register.recency <= 2 then 'absent'
          when s.student_code = 'HS001' and register.code = 'TOAN6-2026A' and register.recency = 2 then 'late'
          when s.student_code = 'HS001' and register.code = 'KET-2025B' and register.recency = 5 then 'absent'
          when s.student_code = 'HS005' and register.recency = 3 then 'excused'
          else 'present'
        end as status
      from public.enrollments e
      join public.students s on s.id = e.student_id
      where e.class_id = register.class_id
        and e.status <> 'pending'
        and s.deleted_at is null
        and e.enrolled_on <= register.session_date
        and (e.ended_on is null or e.ended_on >= register.session_date)
    ) x;

    continue when entries is null;

    perform set_config('request.jwt.claims', json_build_object('sub', register.teacher_profile)::text, false);
    perform public.save_attendance(
      register.class_id,
      register.session_date,
      entries,
      case when register.recency = 1 and register.code = 'TOAN6-2026A' then 'Kiểm tra 15 phút chương Phân số.' end
    );
  end loop;

  perform set_config('request.jwt.claims', '', false);
end;
$$;
-- -----------------------------------------------------------------------------
-- Assignments (fictional), created as the class teachers and worked on by the
-- students through the same functions the app uses. Times are relative to now:
--   Toán homework: Huy submitted on time (graded and returned), Châu late
--   (graded, not yet returned); Toán quiz: Huy has an attempt in progress;
--   Flyers: a published vocabulary quiz, a draft and a scheduled speaking task.
-- -----------------------------------------------------------------------------
do $$
declare
  hung uuid := (select id from auth.users where email = 'gv.hung@bsmart.test');
  ha uuid := (select id from auth.users where email = 'gv.ha@bsmart.test');
  huy uuid := (select id from auth.users where email = 'hs.huy@bsmart.test');
  chau uuid := (select id from auth.users where email = 'hs.chau@bsmart.test');
  toan uuid := (select id from public.classes where code = 'TOAN6-2026A');
  fly uuid := (select id from public.classes where code = 'FLY-2026A');
  homework uuid;
  quiz uuid;
  vocab uuid;
  q1 uuid;
  q2 uuid;
  q3 uuid;
  work uuid;
begin
  -- Toán: homework with questions and an answer key.
  perform set_config('request.jwt.claims', json_build_object('sub', hung)::text, false);

  insert into public.assignments (class_id, title, assignment_type, skill, description, instructions, due_at, max_score)
  values (
    toan, 'Bài tập Phân số – tuần 3', 'homework', 'problem_solving',
    'Luyện tập cộng, trừ phân số và bài toán có lời văn.',
    'Làm cả 3 câu. Câu 3 trình bày lời giải đầy đủ. Có thể chụp ảnh bài làm trên giấy và đính kèm.',
    now() + interval '2 days', 10
  ) returning id into homework;

  insert into public.assignment_questions (assignment_id, position, kind, prompt, points)
  values (homework, 1, 'short_answer', 'Tính: 1/2 + 1/3 = ?', 2) returning id into q1;
  insert into public.assignment_questions (assignment_id, position, kind, prompt, points)
  values (homework, 2, 'short_answer', 'Rút gọn phân số 12/18.', 2) returning id into q2;
  insert into public.assignment_questions (assignment_id, position, kind, prompt, points)
  values (homework, 3, 'long_answer', 'Một lớp có 36 học sinh, 2/3 số học sinh thích môn Toán. Hỏi có bao nhiêu học sinh thích môn Toán?', 6)
  returning id into q3;
  insert into public.assignment_answer_keys (question_id, accepted_answers) values (q1, '{5/6}'), (q2, '{2/3}');
  insert into public.assignment_answer_keys (question_id, explanation) values (q3, '36 × 2/3 = 24 học sinh.');

  update public.assignments set status = 'published' where id = homework;

  -- Huy hands it in on time.
  perform set_config('request.jwt.claims', json_build_object('sub', huy)::text, false);
  work := public.start_submission(homework);
  update public.submissions
  set answers = jsonb_build_object(
        q1::text, jsonb_build_object('text', '5/6'),
        q2::text, jsonb_build_object('text', '2/3'),
        q3::text, jsonb_build_object('text', 'Số học sinh thích Toán là 36 × 2/3 = 24 (học sinh).'))
  where id = work;
  perform public.submit_submission(work);

  -- The due date passes; Châu hands in late.
  perform set_config('request.jwt.claims', json_build_object('sub', hung)::text, false);
  update public.assignments set due_at = now() - interval '1 day' where id = homework;

  perform set_config('request.jwt.claims', json_build_object('sub', chau)::text, false);
  work := public.start_submission(homework);
  update public.submissions
  set answers = jsonb_build_object(
        q1::text, jsonb_build_object('text', '2/5'),
        q2::text, jsonb_build_object('text', '2/3'),
        q3::text, jsonb_build_object('text', '24 học sinh.')),
      response_text = 'Em nộp muộn vì bị ốm ạ.'
  where id = work;
  perform public.submit_submission(work);

  -- Hùng grades both; only Huy's grade is returned so far.
  perform set_config('request.jwt.claims', json_build_object('sub', hung)::text, false);
  perform public.grade_submission(
    (select s.id from public.submissions s join public.students st on st.id = s.student_id
     where s.assignment_id = homework and st.student_code = 'HS001'),
    9.5, 'Rất tốt! Câu 3 nên ghi rõ đơn vị ở từng bước.', true);
  perform public.grade_submission(
    (select s.id from public.submissions s join public.students st on st.id = s.student_id
     where s.assignment_id = homework and st.student_code = 'HS003'),
    6, 'Câu 1 cần quy đồng mẫu số trước khi cộng.', false);

  -- Toán: a timed multiple-choice quiz; Huy has started it.
  insert into public.assignments (class_id, title, assignment_type, skill, instructions, due_at, time_limit_minutes, max_score)
  values (
    toan, 'Kiểm tra 15 phút: Số nguyên tố', 'quiz', 'problem_solving',
    'Chọn một đáp án cho mỗi câu. Bạn có 15 phút kể từ khi bắt đầu.',
    now() + interval '5 days', 15, 10
  ) returning id into quiz;
  insert into public.assignment_questions (assignment_id, position, kind, prompt, options, points)
  values (quiz, 1, 'multiple_choice', 'Số nào là số nguyên tố?', '{9,15,17,21}', 1) returning id into q1;
  insert into public.assignment_questions (assignment_id, position, kind, prompt, options, points)
  values (quiz, 2, 'multiple_choice', 'Có bao nhiêu số nguyên tố nhỏ hơn 10?', '{3,4,5,6}', 1) returning id into q2;
  insert into public.assignment_answer_keys (question_id, correct_option) values (q1, 2), (q2, 1);
  update public.assignments set status = 'published' where id = quiz;

  perform set_config('request.jwt.claims', json_build_object('sub', huy)::text, false);
  work := public.start_submission(quiz);
  update public.submissions set answers = jsonb_build_object(q1::text, jsonb_build_object('choice', 2)) where id = work;

  -- Flyers (Hà): a published vocabulary quiz, a draft and a scheduled task.
  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);
  insert into public.assignments (class_id, title, assignment_type, skill, description, instructions, due_at, max_score)
  values (
    fly, 'Flyers Vocabulary – Animals', 'vocabulary', 'vocabulary',
    'Words from Unit 4.', 'Choose the correct word for each picture description.',
    now() + interval '7 days', 5
  ) returning id into vocab;
  insert into public.assignment_questions (assignment_id, position, kind, prompt, options, points)
  values (vocab, 1, 'multiple_choice', 'It has a very long neck and eats leaves from tall trees.', '{camel,giraffe,kangaroo}', 1)
  returning id into q1;
  insert into public.assignment_answer_keys (question_id, correct_option) values (q1, 1);
  update public.assignments set status = 'published' where id = vocab;

  insert into public.assignments (class_id, title, assignment_type, skill, instructions, requires_file, max_score)
  values (fly, 'Writing: My weekend', 'writing', 'writing',
          'Write 50–70 words about your weekend. Upload a photo or a Word file.', true, 10);

  insert into public.assignments (class_id, title, assignment_type, skill, instructions, max_score, due_at, publish_at, status)
  values (fly, 'Speaking: Describe a picture', 'speaking', 'speaking',
          'Record yourself describing the picture for 1 minute and upload the audio file.', 10,
          now() + interval '10 days', now() + interval '3 days', 'draft');
  update public.assignments set status = 'scheduled'
  where title = 'Speaking: Describe a picture';

  perform set_config('request.jwt.claims', '', false);
end;
$$;
-- -----------------------------------------------------------------------------
-- Question bank and tests (fictional). Questions are saved through
-- save_bank_question as their teacher; attempts through start_test /
-- submit_test_attempt as the students:
--   Toán "Kiểm tra chương 1": Huy finished (essay graded by Hùng), Châu handed
--   in and waits for the essay to be marked. Flyers: a published unit check
--   and a draft grammar test.
-- -----------------------------------------------------------------------------
do $$
declare
  hung uuid := (select id from auth.users where email = 'gv.hung@bsmart.test');
  ha uuid := (select id from auth.users where email = 'gv.ha@bsmart.test');
  huy uuid := (select id from auth.users where email = 'hs.huy@bsmart.test');
  chau uuid := (select id from auth.users where email = 'hs.chau@bsmart.test');
  toan_subject uuid := (select id from public.subjects where code = 'TOAN');
  anh_subject uuid := (select id from public.subjects where code = 'ANH');
  toan uuid := (select id from public.classes where code = 'TOAN6-2026A');
  fly uuid := (select id from public.classes where code = 'FLY-2026A');
  q uuid[] := '{}';
  e uuid[] := '{}';
  math_test uuid;
  fly_test uuid;
  grammar_test uuid;
  attempt uuid;
  tq record;
begin
  -- Toán questions (Hùng).
  perform set_config('request.jwt.claims', json_build_object('sub', hung)::text, false);
  q := q || public.save_bank_question(null, jsonb_build_object(
    'subject_id', toan_subject, 'question_type', 'multiple_choice', 'skill', 'problem_solving',
    'topic', 'Dấu hiệu chia hết', 'difficulty', 'easy', 'points', 1, 'tags', jsonb_build_array('lop6', 'chia-het'),
    'prompt', 'Số nào chia hết cho cả 2 và 3?', 'content', jsonb_build_object('options', jsonb_build_array('8', '9', '12', '15'))),
    '{"correct": 2}', '12 chia hết cho 2 (số chẵn) và cho 3 (1 + 2 = 3).');
  q := q || public.save_bank_question(null, jsonb_build_object(
    'subject_id', toan_subject, 'question_type', 'true_false', 'skill', 'problem_solving',
    'topic', 'Số nguyên tố', 'difficulty', 'easy', 'points', 1, 'tags', jsonb_build_array('lop6', 'so-nguyen-to'),
    'prompt', 'Mọi số nguyên tố đều là số lẻ.'),
    '{"correct": false}', '2 là số nguyên tố chẵn duy nhất.');
  q := q || public.save_bank_question(null, jsonb_build_object(
    'subject_id', toan_subject, 'question_type', 'fill_blank', 'skill', 'problem_solving',
    'topic', 'Phân số', 'difficulty', 'medium', 'points', 1, 'tags', jsonb_build_array('lop6', 'phan-so'),
    'prompt', 'Phân số 6/8 rút gọn thành ___.'),
    '{"blanks": [["3/4"]]}', null);
  q := q || public.save_bank_question(null, jsonb_build_object(
    'subject_id', toan_subject, 'question_type', 'short_answer', 'skill', 'problem_solving',
    'topic', 'Phân số', 'difficulty', 'easy', 'points', 1, 'tags', jsonb_build_array('lop6', 'phan-so'),
    'prompt', 'Tính: 3/5 + 1/5 = ?'),
    '{"accepted": ["4/5"]}', null);
  q := q || public.save_bank_question(null, jsonb_build_object(
    'subject_id', toan_subject, 'question_type', 'essay', 'skill', 'problem_solving',
    'topic', 'Số nguyên tố', 'difficulty', 'medium', 'points', 2, 'tags', jsonb_build_array('lop6', 'so-nguyen-to'),
    'prompt', 'Giải thích vì sao số 1 không phải là số nguyên tố.'),
    '{}', 'Số nguyên tố có đúng hai ước là 1 và chính nó; số 1 chỉ có một ước.');
  q := q || public.save_bank_question(null, jsonb_build_object(
    'subject_id', toan_subject, 'question_type', 'multiple_response', 'skill', 'problem_solving',
    'topic', 'Số nguyên tố', 'difficulty', 'hard', 'points', 2, 'tags', jsonb_build_array('lop6', 'so-nguyen-to'),
    'prompt', 'Chọn tất cả các số nguyên tố:', 'content', jsonb_build_object('options', jsonb_build_array('2', '4', '5', '9', '11'))),
    '{"correct": [0, 2, 4]}', null);

  math_test := null;
  insert into public.tests (class_id, title, description, instructions, time_limit_minutes, max_attempts, shuffle_questions, shuffle_options, total_score)
  values (toan, 'Kiểm tra chương 1', 'Số tự nhiên, phân số, số nguyên tố.',
          'Làm bài trong 20 phút. Câu tự luận trình bày ngắn gọn.', 20, 2, true, true, 10)
  returning id into math_test;
  perform public.add_test_questions(math_test, q);
  update public.tests set status = 'published' where id = math_test;

  -- Huy: all answers, one wrong option in the multiple-response question.
  perform set_config('request.jwt.claims', json_build_object('sub', huy)::text, false);
  attempt := public.start_test(math_test);
  for tq in select id, question_type from public.test_questions where test_id = math_test loop
    insert into public.test_answers (attempt_id, test_question_id, response) values (attempt, tq.id,
      case tq.question_type
        when 'multiple_choice' then '{"choice": 2}'::jsonb
        when 'true_false' then '{"value": false}'
        when 'fill_blank' then '{"blanks": ["3/4"]}'
        when 'short_answer' then '{"text": "4/5"}'
        when 'essay' then '{"text": "Vì số 1 chỉ có một ước là chính nó, còn số nguyên tố phải có đúng hai ước."}'
        else '{"choices": [0, 2, 3]}'
      end);
  end loop;
  perform public.submit_test_attempt(attempt);

  perform set_config('request.jwt.claims', json_build_object('sub', hung)::text, false);
  perform public.grade_test_answer(attempt,
    (select id from public.test_questions where test_id = math_test and question_type = 'essay'),
    2, 'Giải thích đúng và đủ ý.');

  -- Châu: hands in; the essay waits for Hùng.
  perform set_config('request.jwt.claims', json_build_object('sub', chau)::text, false);
  attempt := public.start_test(math_test);
  for tq in select id, question_type from public.test_questions where test_id = math_test loop
    insert into public.test_answers (attempt_id, test_question_id, response) values (attempt, tq.id,
      case tq.question_type
        when 'multiple_choice' then '{"choice": 1}'::jsonb
        when 'true_false' then '{"value": true}'
        when 'fill_blank' then '{"blanks": ["3/4"]}'
        when 'short_answer' then '{"text": "4 / 5"}'
        when 'essay' then '{"text": "Vì 1 không chia hết cho số nào khác."}'
        else '{"choices": [0, 2, 4]}'
      end);
  end loop;
  perform public.submit_test_attempt(attempt);

  -- English questions (Hà).
  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);
  e := e || public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'multiple_choice', 'skill', 'vocabulary', 'cefr_level', 'a1',
    'topic', 'Jobs', 'difficulty', 'easy', 'points', 1, 'tags', jsonb_build_array('flyers', 'jobs'),
    'prompt', 'A person who flies a plane is a …', 'content', jsonb_build_object('options', jsonb_build_array('pilot', 'driver', 'farmer'))),
    '{"correct": 0}', null);
  e := e || public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'matching', 'skill', 'vocabulary', 'cefr_level', 'pre_a1',
    'topic', 'Animals', 'difficulty', 'easy', 'points', 3, 'tags', jsonb_build_array('flyers', 'animals'),
    'prompt', 'Match each animal with the sound it makes.',
    'content', jsonb_build_object('left', jsonb_build_array('cat', 'cow', 'bee'), 'right', jsonb_build_array('moo', 'buzz', 'meow'))),
    '{"pairs": [2, 0, 1]}', null);
  e := e || public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'fill_blank', 'skill', 'grammar', 'cefr_level', 'a1',
    'topic', 'Present simple', 'difficulty', 'easy', 'points', 1, 'tags', jsonb_build_array('flyers', 'present-simple'),
    'prompt', 'She ___ to school every day.'),
    '{"blanks": [["goes", "walks"]]}', 'Third person singular: add -s / -es.');
  e := e || public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'sentence_transformation', 'skill', 'grammar', 'cefr_level', 'a2',
    'topic', 'too + adjective', 'difficulty', 'medium', 'points', 2, 'tags', jsonb_build_array('ket', 'too-enough'),
    'prompt', 'Rewrite the sentence using "too".', 'content', jsonb_build_object('source_text', 'He is very tired, so he can''t play.')),
    '{"accepted": ["He is too tired to play"]}', null);
  e := e || public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'error_correction', 'skill', 'grammar', 'cefr_level', 'a1',
    'topic', 'Present simple', 'difficulty', 'easy', 'points', 1, 'tags', jsonb_build_array('flyers', 'present-simple'),
    'prompt', 'Find the mistake and write the correct sentence.', 'content', jsonb_build_object('source_text', 'She don''t like apples.')),
    '{"accepted": ["She doesn''t like apples", "She does not like apples"]}', null);
  e := e || public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'listening', 'skill', 'listening', 'cefr_level', 'a1',
    'topic', 'Food', 'difficulty', 'medium', 'points', 1, 'tags', jsonb_build_array('flyers', 'food'),
    'prompt', 'Listen. What did Tom have for breakfast? (audio to be attached)',
    'content', jsonb_build_object('format', 'choice', 'options', jsonb_build_array('bread', 'rice', 'eggs'))),
    '{"correct": 2}', 'Transcript: "I had eggs for breakfast," said Tom.');
  e := e || public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'speaking', 'skill', 'speaking', 'cefr_level', 'a1',
    'topic', 'Animals', 'difficulty', 'medium', 'points', 3, 'tags', jsonb_build_array('flyers', 'animals'),
    'prompt', 'Talk about your favourite animal for 30–60 seconds. Upload your recording.',
    'content', jsonb_build_object('max_seconds', 60)),
    '{}', 'Look for: name of the animal, 2–3 descriptive words, a reason.');
  e := e || public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'essay', 'skill', 'writing', 'cefr_level', 'a1',
    'topic', 'Family', 'difficulty', 'medium', 'points', 4, 'tags', jsonb_build_array('flyers', 'writing'),
    'prompt', 'Write 3–5 sentences about your family.', 'content', jsonb_build_object('min_words', 20, 'max_words', 80)),
    '{}', null);

  insert into public.tests (class_id, title, instructions, time_limit_minutes, max_attempts, shuffle_options, total_score, available_until, review_policy)
  values (fly, 'Flyers Unit 4 check', 'Answer every question. You have 30 minutes.', 30, 1, true, 20, now() + interval '7 days', 'after_close')
  returning id into fly_test;
  perform public.add_test_questions(fly_test, e[1:3] || e[6:8]);
  update public.tests set status = 'published' where id = fly_test;

  insert into public.tests (class_id, title, instructions, max_attempts, total_score)
  values (fly, 'Grammar quick test', 'Correct the sentences.', 3, 10)
  returning id into grammar_test;
  perform public.add_test_questions(grammar_test, e[3:5]);

  perform set_config('request.jwt.claims', '', false);
end;
$$;
-- -----------------------------------------------------------------------------
-- English learning (fictional content and activity), created as Hà through the
-- same tables/functions the app uses. Huy has practised the Animals set, done
-- the Present simple exercises and had his writing reviewed; Châu's writing
-- waits for review. The listening lesson stays a draft until audio is uploaded.
-- -----------------------------------------------------------------------------
do $$
declare
  ha uuid := (select id from auth.users where email = 'gv.ha@bsmart.test');
  huy uuid := (select id from auth.users where email = 'hs.huy@bsmart.test');
  chau uuid := (select id from auth.users where email = 'hs.chau@bsmart.test');
  anh_subject uuid := (select id from public.subjects where code = 'ANH');
  animals uuid;
  jobs uuid;
  food uuid;
  grammar uuid;
  reading uuid;
  listening uuid;
  writing uuid;
  q_tf uuid;
  q_mc uuid;
  attempt uuid;
  work uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);

  insert into public.vocabulary_words (word, ipa, part_of_speech, meaning_vi, definition_en, example, collocations, synonyms, antonyms, cefr_level, topic)
  values
    ('cat', '/kæt/', 'noun', 'con mèo', 'a small animal with soft fur, often kept as a pet', 'My cat sleeps on the sofa every afternoon.', '{pet cat,feed the cat}', '{kitty}', '{}', 'pre_a1', 'Animals'),
    ('rabbit', '/ˈræb.ɪt/', 'noun', 'con thỏ', 'a small animal with long ears that lives in holes', 'The rabbit is eating a carrot.', '{pet rabbit}', '{bunny}', '{}', 'pre_a1', 'Animals'),
    ('elephant', '/ˈel.ɪ.fənt/', 'noun', 'con voi', 'a very large grey animal with a long nose called a trunk', 'An elephant can carry heavy things with its trunk.', '{baby elephant}', '{}', '{}', 'a1', 'Animals'),
    ('giraffe', '/dʒɪˈrɑːf/', 'noun', 'con hươu cao cổ', 'a tall African animal with a very long neck', 'The giraffe eats leaves from tall trees.', '{}', '{}', '{}', 'a1', 'Animals'),
    ('tiger', '/ˈtaɪ.ɡər/', 'noun', 'con hổ', 'a large wild cat with orange fur and black stripes', 'We saw a tiger at the zoo.', '{wild tiger}', '{}', '{}', 'a1', 'Animals'),
    ('dolphin', '/ˈdɒl.fɪn/', 'noun', 'cá heo', 'a clever sea animal that breathes air', 'The dolphin jumped out of the water.', '{}', '{}', '{}', 'a1', 'Animals'),
    ('pilot', '/ˈpaɪ.lət/', 'noun', 'phi công', 'a person who flies a plane', 'The pilot said hello to the passengers.', '{airline pilot}', '{aviator}', '{}', 'a1', 'Jobs'),
    ('farmer', '/ˈfɑː.mər/', 'noun', 'nông dân', 'a person who grows food or keeps animals on a farm', 'The farmer gets up very early.', '{rice farmer}', '{}', '{}', 'a1', 'Jobs'),
    ('doctor', '/ˈdɒk.tər/', 'noun', 'bác sĩ', 'a person who helps sick people get better', 'I went to the doctor because I had a cough.', '{see a doctor}', '{}', '{}', 'pre_a1', 'Jobs'),
    ('teacher', '/ˈtiː.tʃər/', 'noun', 'giáo viên', 'a person who helps students learn', 'Our teacher reads us a story on Fridays.', '{English teacher}', '{}', '{student}', 'pre_a1', 'Jobs'),
    ('breakfast', '/ˈbrek.fəst/', 'noun', 'bữa sáng', 'the first meal of the day', 'I have eggs for breakfast.', '{have breakfast,eat breakfast}', '{}', '{}', 'pre_a1', 'Food'),
    ('delicious', '/dɪˈlɪʃ.əs/', 'adjective', 'ngon', 'with a very good taste', 'This soup is delicious!', '{}', '{tasty}', '{disgusting}', 'a1', 'Food'),
    ('happy', '/ˈhæp.i/', 'adjective', 'vui vẻ, hạnh phúc', 'feeling pleased', 'She is happy because it is her birthday.', '{feel happy}', '{glad,cheerful}', '{sad,unhappy}', 'pre_a1', 'Feelings'),
    ('quickly', '/ˈkwɪk.li/', 'adverb', 'nhanh chóng', 'at a fast speed', 'He ran quickly to catch the bus.', '{}', '{fast}', '{slowly}', 'a1', 'Describing actions');

  insert into public.vocabulary_sets (title, description, cefr_level, topic) values ('Animals', 'Flyers Unit 4 animals.', 'a1', 'Animals') returning id into animals;
  insert into public.vocabulary_set_words (set_id, word_id, position)
  select animals, id, row_number() over (order by word) from public.vocabulary_words where topic = 'Animals';
  update public.vocabulary_sets set status = 'published' where id = animals;

  insert into public.vocabulary_sets (title, cefr_level, topic) values ('Jobs', 'a1', 'Jobs') returning id into jobs;
  insert into public.vocabulary_set_words (set_id, word_id, position)
  select jobs, id, row_number() over (order by word) from public.vocabulary_words where topic = 'Jobs';
  update public.vocabulary_sets set status = 'published' where id = jobs;

  insert into public.vocabulary_sets (title, cefr_level, topic) values ('Food (draft)', 'pre_a1', 'Food') returning id into food;
  insert into public.vocabulary_set_words (set_id, word_id, position)
  select food, id, row_number() over (order by word) from public.vocabulary_words where topic = 'Food';

  -- Grammar: Present simple, exercises copied from the question bank.
  insert into public.lessons (skill, title, cefr_level, topic, summary, body, form, usage, examples, common_mistakes, status)
  values (
    'grammar', 'Present simple', 'a1', 'Tenses', 'Talking about habits and facts.',
    'We use the present simple for things that happen regularly and for facts. With he, she and it we add -s or -es to the verb.',
    E'I / you / we / they + verb: I play.\nhe / she / it + verb + -s/-es: She plays. He watches.\nNegative: don''t / doesn''t + verb.\nQuestion: Do / Does + subject + verb?',
    'Habits and routines (every day, on Mondays), facts (The sun rises in the east), timetables.',
    '{"She goes to school every day.","They don''t like milk.","Does he play football?"}',
    '[{"incorrect": "She don''t like apples.", "correct": "She doesn''t like apples.", "note": "he/she/it + doesn''t"},
      {"incorrect": "He play football.", "correct": "He plays football.", "note": "add -s with he/she/it"},
      {"incorrect": "Does she likes it?", "correct": "Does she like it?", "note": "after does, no -s"}]',
    'published'
  ) returning id into grammar;
  perform public.add_lesson_questions(grammar, array(
    select id from public.bank_questions where prompt in ('She ___ to school every day.', 'Find the mistake and write the correct sentence.')
  ));

  -- Reading with glossed words and two new bank questions.
  q_tf := public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'true_false', 'skill', 'reading', 'cefr_level', 'a1', 'topic', 'Family', 'points', 1,
    'tags', jsonb_build_array('reading', 'family'), 'prompt', 'Tom has two sisters.'), '{"correct": false}', 'Tom has one sister, Lily.');
  q_mc := public.save_bank_question(null, jsonb_build_object(
    'subject_id', anh_subject, 'question_type', 'multiple_choice', 'skill', 'reading', 'cefr_level', 'a1', 'topic', 'Family', 'points', 1,
    'tags', jsonb_build_array('reading', 'family'), 'prompt', 'What does Tom''s father do?',
    'content', jsonb_build_object('options', jsonb_build_array('He is a pilot.', 'He is a farmer.', 'He is a doctor.'))),
    '{"correct": 1}', '"My father is a farmer. He gets up very early."');
  insert into public.lessons (skill, title, cefr_level, topic, summary, body, status)
  values (
    'reading', 'Tom''s family', 'a1', 'Family', 'A short text about a family on a farm.',
    E'My name is Tom. I live on a farm with my family. My father is a farmer. He gets up very early and feeds the animals.\n\nMy mother is a doctor in the village. I have one sister, Lily. She is six and she loves our rabbit.\n\nOn Sundays we have a big breakfast together. It is delicious!',
    'published'
  ) returning id into reading;
  insert into public.lesson_words (lesson_id, word_id)
  select reading, id from public.vocabulary_words where word in ('farmer', 'doctor', 'rabbit', 'breakfast', 'delicious');
  perform public.add_lesson_questions(reading, array[q_tf, q_mc]);

  -- Listening: transcript ready, audio still to be uploaded (so it stays a draft).
  insert into public.lessons (skill, title, cefr_level, topic, summary, body)
  values ('listening', 'Tom''s breakfast', 'a1', 'Food', 'Listen and answer.', 'Listen to Tom talking about his morning, then answer the question.')
  returning id into listening;
  insert into public.lesson_private (lesson_id, transcript) values (listening, '"I had eggs for breakfast," said Tom. "Then I walked to school with Lily."');
  perform public.add_lesson_questions(listening, array(select id from public.bank_questions where question_type = 'listening' limit 1));

  insert into public.lessons (skill, title, cefr_level, topic, summary, body, response_mode, max_score, status)
  values ('speaking', 'My favourite animal', 'a1', 'Animals', 'Talk for about one minute.',
          E'Talk about your favourite animal for about one minute.\n• What is it?\n• What does it look like?\n• Why do you like it?',
          'audio_or_video', 10, 'published');

  insert into public.lessons (skill, title, cefr_level, topic, summary, body, response_mode, min_words, max_words, rubric, status)
  values ('writing', 'My weekend', 'a1', 'Free time', 'Write 50–120 words.',
          'Write about what you did last weekend. Say where you went, who you were with and how you felt.',
          'text', 50, 120,
          '[{"criterion": "Task", "description": "Answers all three points", "max_points": 4},
            {"criterion": "Grammar", "description": "Past simple used correctly", "max_points": 3},
            {"criterion": "Vocabulary", "description": "Varied, accurate words", "max_points": 3}]',
          'published')
  returning id into writing;
  insert into public.lesson_private (lesson_id, model_answer)
  values (writing, 'Last Saturday I went to the park with my cousin. We rode our bikes and had ice cream. On Sunday I helped my mother cook lunch. I felt tired but happy.');

  insert into public.lessons (skill, title, cefr_level, topic, summary, body, response_mode, max_score, status)
  values ('pronunciation', 'The "th" sounds /θ/ and /ð/', 'a1', 'Consonants', 'Put your tongue between your teeth.',
          E'Listen and repeat, then record yourself reading:\nthree /θriː/ – think /θɪŋk/ – thank you /ˈθæŋk juː/\nthis /ðɪs/ – mother /ˈmʌð.ər/ – brother /ˈbrʌð.ər/\n\n"My brother thinks this is the third one."',
          'audio', 10, 'published');

  -- Huy practises and hands in writing.
  perform set_config('request.jwt.claims', json_build_object('sub', huy)::text, false);
  perform public.record_vocabulary_practice(animals, 'flashcards',
    (select jsonb_agg(jsonb_build_object('word_id', word_id, 'correct', true)) from public.vocabulary_set_words where set_id = animals));
  perform public.record_vocabulary_practice(animals, 'multiple_choice',
    (select jsonb_agg(jsonb_build_object('word_id', w.word_id, 'correct', v.word <> 'giraffe'))
     from public.vocabulary_set_words w join public.vocabulary_words v on v.id = w.word_id where w.set_id = animals));
  attempt := public.submit_lesson_practice(grammar, (
    select jsonb_object_agg(q.id, case q.question_type when 'fill_blank' then '{"blanks": ["goes"]}'::jsonb else '{"text": "She doesn''t like apples."}' end)
    from public.lesson_questions q where q.lesson_id = grammar));
  work := public.submit_lesson_work(writing,
    'Last weekend I went to my grandmother''s house in the countryside with my parents. We fed the chickens and I played with her dog. In the evening we eated a big dinner. I was very happy but a little tired.');

  -- Châu: reading exercises (one mistake) and writing waiting for review.
  perform set_config('request.jwt.claims', json_build_object('sub', chau)::text, false);
  perform public.submit_lesson_practice(reading, (
    select jsonb_object_agg(q.id, case when q.source_question_id = q_tf then '{"value": true}'::jsonb else '{"choice": 1}' end)
    from public.lesson_questions q where q.lesson_id = reading));
  perform public.submit_lesson_work(writing,
    'On Saturday I stayed at home. I read a book about space and watched a film with my brother. On Sunday we went to the market with our mother.');

  -- Hà (Huy's KET teacher) reviews Huy's writing.
  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);
  perform public.review_lesson_submission(work,
    'Good ideas and clear order. Watch the past tense: "ate", not "eated".', '[4, 2, 3]'::jsonb);

  perform set_config('request.jwt.claims', '', false);
end;
$$;
-- -----------------------------------------------------------------------------
-- Writing and speaking assessments (fictional). Hà sets three Flyers tasks.
-- Ngọc Anh (HS002) and Linh (HS005) have no login, so their writing is added
-- directly; Hà highlights and grades Ngọc Anh's work and returns it; Linh's
-- waits for grading.
-- -----------------------------------------------------------------------------
do $$
declare
  ha uuid := (select id from auth.users where email = 'gv.ha@bsmart.test');
  fly uuid := (select id from public.classes where code = 'FLY-2026A');
  general_rubric public.assessment_rubrics := (select r from public.assessment_rubrics r where name = 'General writing');
  ielts_rubric public.assessment_rubrics := (select r from public.assessment_rubrics r where name = 'IELTS-style Writing (bands 0–9)');
  speaking_rubric public.assessment_rubrics := (select r from public.assessment_rubrics r where name = 'Speaking');
  email_task uuid;
  anh uuid;
  linh uuid;
  body text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);

  insert into public.assessment_tasks (class_id, kind, title, cefr_level, task, instructions, response_mode, min_words, max_words,
                                       rubric_id, scoring, criteria, max_score, max_attempts, due_at, status)
  values (fly, 'writing', 'Email to a friend', 'a1',
          'Your friend Sam wants to know about your weekend. Write an email to Sam.',
          E'Say:\n• where you went\n• who you went with\n• what you liked best',
          'online_or_document', 50, 100, general_rubric.id, general_rubric.scoring, general_rubric.criteria, 0, 2,
          now() + interval '5 days', 'published')
  returning id into email_task;

  insert into public.assessment_tasks (class_id, kind, title, cefr_level, task, instructions, response_mode, min_words,
                                       rubric_id, scoring, criteria, max_score, status)
  values (fly, 'writing', 'Opinion essay (IELTS-style practice)', 'b1',
          'Some people think children should learn a foreign language at primary school. Do you agree or disagree?',
          'Write at least 150 words. Give reasons and examples.', 'online_text', 150,
          ielts_rubric.id, ielts_rubric.scoring, ielts_rubric.criteria, 0, 'draft');

  insert into public.assessment_tasks (class_id, kind, title, cefr_level, task, instructions, response_mode, max_duration_seconds,
                                       rubric_id, scoring, criteria, max_score, due_at, status)
  values (fly, 'speaking', 'Describe your favourite animal', 'a1',
          'Talk about your favourite animal: what it looks like, what it eats and why you like it.',
          'Record 1 minute. You can record audio or video.', 'audio_or_video', 90,
          speaking_rubric.id, speaking_rubric.scoring, speaking_rubric.criteria, 0, now() + interval '7 days', 'published');

  -- Students without a login: added directly for the demo.
  body := 'Hi Sam, Last weekend I go to the zoo with my family. We saw a big elephant and two giraffes. My brother like the monkeys best. I liked the penguins because they was very funny. After that we eat ice cream. See you soon, Anh';
  insert into public.assessment_submissions (task_id, student_id, attempt, text_response, word_count)
  values (email_task, (select id from public.students where student_code = 'HS002'), 1, body,
          array_length(regexp_split_to_array(body, '\s+'), 1))
  returning id into anh;
  insert into public.assessment_events (submission_id, event) values (anh, 'submitted');

  insert into public.assessment_annotations (submission_id, anchor, start_offset, end_offset, category, comment, suggestion)
  values
    (anh, 'text', position('go to the zoo' in body) - 1, position('go to the zoo' in body) + 1, 'grammar', 'Past tense: last weekend.', 'went'),
    (anh, 'text', position('like the monkeys' in body) - 1, position('like the monkeys' in body) + 3, 'grammar', 'Past tense.', 'liked'),
    (anh, 'text', position('they was' in body) - 1, position('they was' in body) + 7, 'grammar', 'they + were', 'they were'),
    (anh, 'text', position('we eat' in body) - 1, position('we eat' in body) + 5, 'grammar', 'Past tense of eat.', 'we ate'),
    (anh, 'general', null, null, 'content', 'You answered all three points – well done!', null);
  perform public.grade_assessment(anh, '[5, 4, 4, 2]', 'Lovely email with all the information Sam needs. Practise the past simple: go → went, eat → ate.', true);

  body := 'Dear Sam, On Saturday I visited my grandma. We cooked noodles together and played cards. On Sunday I went swimming with my cousin. The best part was the swimming pool. Love, Linh';
  insert into public.assessment_submissions (task_id, student_id, attempt, text_response, word_count)
  values (email_task, (select id from public.students where student_code = 'HS005'), 1, body,
          array_length(regexp_split_to_array(body, '\s+'), 1))
  returning id into linh;
  insert into public.assessment_events (submission_id, event) values (linh, 'submitted');

  perform set_config('request.jwt.claims', '', false);
end;
$$;
-- -----------------------------------------------------------------------------
-- Online teaching (fictional; example.test / sample meeting links). Flyers has
-- a finished online lesson last week (materials, notes, homework, recording)
-- and one tomorrow on Google Meet; Toán has a Zoom revision session in three
-- days. Huy has opened nothing yet.
-- -----------------------------------------------------------------------------
do $$
declare
  ha uuid := (select id from auth.users where email = 'gv.ha@bsmart.test');
  hung uuid := (select id from auth.users where email = 'gv.hung@bsmart.test');
  fly uuid := (select id from public.classes where code = 'FLY-2026A');
  toan uuid := (select id from public.classes where code = 'TOAN6-2026A');
  ha_teacher uuid := (select id from public.teachers where teacher_code = 'GV002');
  hung_teacher uuid := (select id from public.teachers where teacher_code = 'GV001');
  today date := private.academy_today();
  past uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);

  insert into public.online_sessions (class_id, teacher_id, title, agenda, starts_at, ends_at, provider, meeting_url, meeting_code)
  values (fly, ha_teacher, 'Unit 4 – Animals (online)',
          E'1. Warm-up: animal sounds\n2. New words\n3. Reading: At the zoo\n4. Homework',
          ((today - 7) + time '17:30') at time zone 'Asia/Ho_Chi_Minh',
          ((today - 7) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
          'google_meet', 'https://meet.google.com/abc-defg-hij', 'abc-defg-hij')
  returning id into past;
  update public.online_sessions set status = 'live' where id = past;
  update public.online_sessions set status = 'ended', recording_url = 'https://drive.example.test/recordings/unit-4' where id = past;

  insert into public.online_session_materials (session_id, kind, title, url)
  values (past, 'link', 'Unit 4 slides', 'https://slides.example.test/flyers/unit-4'),
         (past, 'link', 'Animal sounds game', 'https://games.example.test/animal-sounds');
  insert into public.online_session_materials (session_id, kind, title, url, visible_to_students)
  values (past, 'link', 'Teacher answer sheet', 'https://docs.example.test/flyers/unit-4-answers', false);
  insert into public.online_session_notes (session_id, notes)
  values (past, 'Good energy. Ngọc Anh struggled with "giraffe" – revise next time. Linh joined 5 minutes late (connection).');
  insert into public.online_session_homework (session_id, assignment_id)
  select past, id from public.assignments where title = 'Flyers Vocabulary – Animals';

  insert into public.online_sessions (class_id, teacher_id, title, agenda, starts_at, ends_at, provider, meeting_url, meeting_code)
  values (fly, ha_teacher, 'Unit 5 – Food (online)', 'Food words, a listening game and speaking practice in pairs.',
          ((today + 1) + time '17:30') at time zone 'Asia/Ho_Chi_Minh',
          ((today + 1) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
          'google_meet', 'https://meet.google.com/xyz-abcd-efg', 'xyz-abcd-efg');

  perform set_config('request.jwt.claims', json_build_object('sub', hung)::text, false);
  insert into public.online_sessions (class_id, teacher_id, title, agenda, starts_at, ends_at, provider, meeting_url, meeting_code, passcode)
  values (toan, hung_teacher, 'Ôn tập phân số (trực tuyến)', 'Chữa bài tập tuần 3 và luyện đề 15 phút.',
          ((today + 3) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
          ((today + 3) + time '20:00') at time zone 'Asia/Ho_Chi_Minh',
          'zoom', 'https://us02web.zoom.us/j/81234567890?pwd=example', '812 3456 7890', 'toan6');

  perform set_config('request.jwt.claims', '', false);
end;
$$;
-- -----------------------------------------------------------------------------
-- Lesson designer: Hà has Flyers vocabulary cards (from the Vocabulary
-- template, shared by link) and a grammar lesson; Hùng has a Toán exit ticket.
-- -----------------------------------------------------------------------------
do $$
declare
  ha uuid := (select id from auth.users where email = 'gv.ha@bsmart.test');
  hung uuid := (select id from auth.users where email = 'gv.hung@bsmart.test');
  cards uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);
  insert into public.designs (title, kind, template_key, content)
  select 'Flyers Unit 4 – Animal cards', kind, key, content from public.design_templates where key = 'vocabulary-cards'
  returning id into cards;
  perform public.set_design_sharing(cards, 'on');
  insert into public.designs (title, kind, template_key, content)
  select 'Past simple – Flyers', kind, key, content from public.design_templates where key = 'grammar-rule-practice';

  perform set_config('request.jwt.claims', json_build_object('sub', hung)::text, false);
  insert into public.designs (title, kind, content)
  values ('Phiếu kiểm tra cuối giờ – Phân số', 'exit_ticket', jsonb_build_object(
    'pageSize', 'a4_landscape',
    'pages', jsonb_build_array(jsonb_build_object('id', 'p1', 'background', '#ffffff', 'elements', jsonb_build_array(
      jsonb_build_object('id', 'e1', 'type', 'text', 'x', 50, 'y', 40, 'w', 1023, 'h', 60, 'text', 'Phiếu kiểm tra cuối giờ',
        'fontSize', 40, 'fontFamily', 'sans', 'bold', true, 'italic', false, 'underline', false, 'align', 'left', 'color', '#1e3a5f', 'fill', 'transparent'),
      jsonb_build_object('id', 'e2', 'type', 'question', 'x', 50, 'y', 130, 'w', 1023, 'h', 220, 'questionType', 'multiple_choice',
        'prompt', '1/2 + 1/4 = ?', 'options', jsonb_build_array('2/6', '3/4', '1/8'), 'correct', jsonb_build_array(1), 'answers', '[]'::jsonb,
        'explanation', 'Quy đồng: 2/4 + 1/4 = 3/4.', 'fontSize', 26, 'color', '#1f2937', 'fill', '#ffffff'),
      jsonb_build_object('id', 'e3', 'type', 'question', 'x', 50, 'y', 380, 'w', 1023, 'h', 180, 'questionType', 'short_answer',
        'prompt', 'Rút gọn phân số 6/8.', 'options', '[]'::jsonb, 'correct', '[]'::jsonb, 'answers', jsonb_build_array('3/4'),
        'explanation', '', 'fontSize', 26, 'color', '#1f2937', 'fill', '#ffffff')
    )))
  ));

  perform set_config('request.jwt.claims', '', false);
end;
$$;
-- -----------------------------------------------------------------------------
-- Material library: folders only. Materials are real files, which a SQL seed
-- cannot upload to Storage, so the library starts empty of files.
-- -----------------------------------------------------------------------------
do $$
declare
  ha uuid := (select id from auth.users where email = 'gv.ha@bsmart.test');
  admin uuid := (select id from auth.users where email = 'admin@bsmart.test');
  flyers uuid;
  cambridge uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);
  insert into public.library_folders (scope, name) values ('personal', 'Flyers 2026A') returning id into flyers;
  insert into public.library_folders (scope, name, parent_id) values ('personal', 'Unit 4 – Animals', flyers), ('personal', 'Unit 5 – Food', flyers);

  perform set_config('request.jwt.claims', json_build_object('sub', admin)::text, false);
  insert into public.library_folders (scope, name) values ('academy', 'Cambridge Young Learners') returning id into cambridge;
  insert into public.library_folders (scope, name, parent_id) values ('academy', 'Starters', cambridge), ('academy', 'Movers', cambridge), ('academy', 'Flyers', cambridge);
  insert into public.library_folders (scope, name) values ('academy', 'Toán THCS'), ('academy', 'Hướng dẫn cho giáo viên');

  perform set_config('request.jwt.claims', '', false);
end;
$$;
-- -----------------------------------------------------------------------------
-- Progress history (fictional): Ngọc Anh (HS002) has practised the Animals
-- words about once a week for ten weeks, improving over time, so progress
-- charts have something to show her mother (Lan) and her teacher (Hà).
-- -----------------------------------------------------------------------------
do $$
declare
  anh uuid := (select id from public.students where student_code = 'HS002');
  animals uuid := (select id from public.vocabulary_sets where title = 'Animals');
  week integer;
begin
  for week in 1..10 loop
    insert into public.vocabulary_practice (student_id, set_id, activity, correct, total, created_at)
    values (anh, animals,
            (array['flashcards', 'matching', 'multiple_choice', 'spelling']::public.vocabulary_activity[])[1 + week % 4],
            least(6, 2 + week / 2), 6,
            now() - make_interval(days => 7 * (11 - week)) + interval '16 hours');
  end loop;
end;
$$;
-- -----------------------------------------------------------------------------
-- Communication (fictional): an academy announcement for families, a Flyers
-- class announcement from Hà, and Hà writing to Lan about Ngọc Anh (HS002).
-- -----------------------------------------------------------------------------
do $$
declare
  admin uuid := (select id from auth.users where email = 'admin@bsmart.test');
  ha uuid := (select id from auth.users where email = 'gv.ha@bsmart.test');
  lan uuid := (select id from auth.users where email = 'ph.lan@bsmart.test');
  fly uuid := (select id from public.classes where code = 'FLY-2026A');
  anh uuid := (select id from public.students where student_code = 'HS002');
  thread uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin)::text, false);
  insert into public.announcements (audience, title, body, pinned)
  values ('parents', 'Họp phụ huynh cuối tháng 10',
          E'Kính mời quý phụ huynh tham dự buổi họp phụ huynh lúc 18:00 thứ Bảy cuối tháng tại cơ sở chính.\nGiáo viên sẽ trao đổi về kết quả học tập giữa kỳ.', true);

  perform set_config('request.jwt.claims', json_build_object('sub', ha)::text, false);
  insert into public.announcements (audience, class_id, title, body)
  values ('class', fly, 'Mang theo sách Flyers Unit 5', 'Buổi học tới chúng ta bắt đầu Unit 5 – Food. Các con nhớ mang sách và bút chì màu nhé.');
  insert into public.message_threads (student_id, teacher_profile_id, parent_profile_id) values (anh, ha, lan) returning id into thread;
  insert into public.messages (thread_id, body)
  values (thread, 'Chào chị Lan, tuần này Ngọc Anh vắng 2 buổi. Chị cho em hỏi con có khỏe không ạ? Em đã gửi bài tập bù trên hệ thống.');

  perform set_config('request.jwt.claims', json_build_object('sub', lan)::text, false);
  insert into public.messages (thread_id, body)
  values (thread, 'Cảm ơn cô Hà. Con bị sốt nhẹ nên nghỉ ở nhà, tuần sau con đi học lại bình thường ạ.');

  perform set_config('request.jwt.claims', '', false);
end;
$$;