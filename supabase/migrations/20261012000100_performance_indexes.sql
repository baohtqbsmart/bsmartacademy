-- =============================================================================
-- Production preparation: indexes for foreign keys on hot paths.
--
-- Found by listing foreign keys whose columns lead no index. Indexed here are
-- the ones used by RLS policies, rate-limit checks, report filters, joins in
-- analytics/tests, and cascading deletes. "created_by -> profiles" columns
-- that are only displayed are left unindexed on purpose (write cost, no reads).
-- =============================================================================

-- Rate-limit checks (per sender / creator within a time window).
create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);
create index if not exists message_threads_creator_idx on public.message_threads (created_by, created_at desc);
create index if not exists announcements_creator_idx on public.announcements (created_by, created_at desc);

-- Registers: records are looked up and cascaded by their register.
create index if not exists attendance_records_session_idx on public.attendance_records (session_id);

-- Library: favourites per material (cascade), own folders (RLS), filters.
create index if not exists library_favorites_material_idx on public.library_favorites (material_id);
create index if not exists library_folders_owner_idx on public.library_folders (owner_id);
create index if not exists library_materials_subject_idx on public.library_materials (subject_id);
create index if not exists library_materials_level_idx on public.library_materials (level_id);

-- Notifications about a student (family views, cascades).
create index if not exists notifications_student_idx on public.notifications (student_id);

-- Online teaching joins.
create index if not exists online_session_homework_assignment_idx on public.online_session_homework (assignment_id);
create index if not exists online_session_joins_student_idx on public.online_session_joins (student_id);

-- Tests and English: per-question statistics and word/set joins.
create index if not exists test_answers_question_idx on public.test_answers (test_question_id);
create index if not exists vocabulary_practice_set_idx on public.vocabulary_practice (set_id);
create index if not exists vocabulary_progress_word_idx on public.vocabulary_progress (word_id);
create index if not exists lesson_words_word_idx on public.lesson_words (word_id);
create index if not exists lesson_questions_source_idx on public.lesson_questions (source_question_id);

-- Tuition reporting.
create index if not exists student_tuitions_plan_idx on public.student_tuitions (plan_id);
create index if not exists student_tuition_discounts_rule_idx on public.student_tuition_discounts (rule_id);

-- Reports filter classes by course level and teachers' assignments by author.
create index if not exists courses_level_idx on public.courses (level_id, subject_id);
create index if not exists assignments_creator_idx on public.assignments (created_by, created_at desc);

-- Admin dashboard: submissions waiting to be marked.
create index if not exists submissions_submitted_idx on public.submissions (assignment_id) where status = 'submitted';
