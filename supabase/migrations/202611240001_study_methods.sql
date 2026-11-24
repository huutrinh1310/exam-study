alter table public.attempts
  add column mode text not null default 'practice',
  add constraint attempts_mode_valid
    check (mode in ('practice', 'full_test', 'drag_drop'));

create table public.flashcard_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  rating text not null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint flashcard_progress_user_question_unique unique (user_id, question_id),
  constraint flashcard_progress_rating_valid check (rating in ('known', 'review'))
);

alter table public.flashcard_progress enable row level security;
revoke all on table public.flashcard_progress from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.score_response(p_question_id uuid, p_response jsonb)
returns boolean
language plpgsql
set search_path = pg_catalog, public, auth
as $function$
declare
  v_question public.questions%rowtype;
  v_answer jsonb;
  v_labels text[];
  v_response_labels text[];
  v_correct boolean;
begin
  select question.*
  into v_question
  from public.questions as question
  where question.id = p_question_id;

  if not found then
    raise exception 'Question was not found.';
  end if;

  select answer_key.answer
  into v_answer
  from public.answer_keys as answer_key
  where answer_key.question_id = p_question_id;

  if not found then
    raise exception 'Question answer key was not found.';
  end if;

  select pg_catalog.array_agg(choice.value->>'label' order by choice.value->>'label')
  into v_labels
  from jsonb_array_elements(v_question.choices) as choice(value);

  if v_question.kind in ('single', 'multiple') then
    if jsonb_typeof(p_response) is distinct from 'array' then
      raise exception 'Response must be an array of choice labels.';
    end if;
    if (
      v_question.kind = 'single'
      and jsonb_array_length(p_response) <> 1
    ) or (
      v_question.kind = 'multiple'
      and (
        jsonb_array_length(p_response) < 1
        or jsonb_array_length(p_response) > pg_catalog.cardinality(v_labels)
      )
    ) then
      raise exception 'Response has the wrong number of choice labels.';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_response) as response_item(value)
      where jsonb_typeof(response_item.value) is distinct from 'string'
    ) then
      raise exception 'Response choice labels must be text.';
    end if;

    select coalesce(
      pg_catalog.array_agg(response_item.value #>> '{}'),
      array[]::text[]
    )
    into v_response_labels
    from jsonb_array_elements(p_response) as response_item(value);

    if pg_catalog.cardinality(v_response_labels) <>
       (select pg_catalog.count(distinct label)
        from pg_catalog.unnest(v_response_labels) as labels(label)) then
      raise exception 'Response choice labels must be distinct.';
    end if;
    if exists (
      select 1
      from pg_catalog.unnest(v_response_labels) as labels(label)
      where not (labels.label = any(v_labels))
    ) then
      raise exception 'Response contains an unavailable choice label.';
    end if;

    if v_question.kind = 'single' then
      v_correct := p_response = v_answer;
    else
      v_correct :=
        jsonb_array_length(p_response) = jsonb_array_length(v_answer)
        and not exists (
          select 1
          from jsonb_array_elements(p_response) as response_item(value)
          where not (v_answer @> jsonb_build_array(response_item.value))
        );
    end if;
  elsif v_question.kind = 'yes_no' then
    if jsonb_typeof(p_response) is distinct from 'object' then
      raise exception 'Yes/no response must be an object of booleans.';
    end if;
    if (select count(*) from pg_catalog.jsonb_object_keys(p_response)) <>
       pg_catalog.cardinality(v_labels) then
      raise exception 'Yes/no response must include exactly one value per choice.';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(p_response) as response_key(label)
      where not (response_key.label = any(v_labels))
    ) or exists (
      select 1
      from pg_catalog.unnest(v_labels) as labels(label)
      where not (p_response ? labels.label)
    ) then
      raise exception 'Yes/no response keys must match the available choices exactly.';
    end if;
    if exists (
      select 1
      from jsonb_each(p_response) as response_entry(label, value)
      where jsonb_typeof(response_entry.value) is distinct from 'boolean'
    ) then
      raise exception 'Yes/no response values must be booleans.';
    end if;
    v_correct := p_response = v_answer;
  else
    raise exception 'Question kind is invalid.';
  end if;

  return v_correct;
end
$function$;

revoke all on function private.score_response(uuid, jsonb) from public, anon, authenticated;

drop function public.start_attempt(uuid, text[], boolean);

create function public.start_attempt(
  p_quiz_id uuid,
  p_categories text[] default null,
  p_shuffle boolean default false,
  p_mode text default 'practice'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
  v_question_ids uuid[];
  v_attempt_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to start an attempt.';
  end if;
  if p_shuffle is null then
    raise exception 'Shuffle must be true or false.';
  end if;
  if p_mode is null or p_mode not in ('practice', 'full_test', 'drag_drop') then
    raise exception 'Attempt mode must be practice, full_test, or drag_drop.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = p_quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Quiz not found or not available for study.';
  end if;

  if p_categories is not null then
    if pg_catalog.cardinality(p_categories) = 0 then
      raise exception 'Category selection cannot be empty.';
    end if;
    if exists (
      select 1
      from pg_catalog.unnest(p_categories) as requested(category)
      where requested.category is null
         or regexp_replace(
           requested.category,
           '^[[:space:]]+|[[:space:]]+$',
           '',
           'g'
         ) = ''
         or not exists (
           select 1
           from public.questions as question
           where question.quiz_id = v_quiz.id
             and question.category = requested.category
         )
    ) then
      raise exception 'Category selection contains an unrecognized category.';
    end if;
  end if;

  select pg_catalog.array_agg(
    question.id
    order by
      case when p_shuffle then pg_catalog.random() else null::double precision end,
      question.position
  )
  into v_question_ids
  from public.questions as question
  where question.quiz_id = v_quiz.id
    and (p_categories is null or question.category = any(p_categories));

  if v_question_ids is null or pg_catalog.cardinality(v_question_ids) = 0 then
    raise exception 'No questions match the selected categories.';
  end if;

  insert into public.attempts (user_id, quiz_id, question_ids, mode)
  values (v_user_id, v_quiz.id, v_question_ids, p_mode)
  returning id into v_attempt_id;

  return v_attempt_id;
end
$function$;

create or replace function public.get_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_quiz public.quizzes%rowtype;
  v_answered integer;
  v_correct integer;
  v_questions jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to read an attempt.';
  end if;

  select attempt.*
  into v_attempt
  from public.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = v_user_id;

  if not found then
    raise exception 'Attempt not found for the current user.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = v_attempt.quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Quiz access has been revoked or is unavailable.';
  end if;

  select pg_catalog.count(*)::integer,
         coalesce(pg_catalog.sum(case when response.correct then 1 else 0 end), 0)::integer
  into v_answered, v_correct
  from public.responses as response
  where response.attempt_id = v_attempt.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', question.id,
        'position', question.position,
        'category', question.category,
        'prompt', question.prompt,
        'choices', question.choices,
        'kind', question.kind,
        'response', response.response,
        'feedback', case
          when response.attempt_id is null then null
          else jsonb_build_object(
            'correct', response.correct,
            'answer', answer_key.answer,
            'explanation', answer_key.explanation
          )
        end
      )
      order by selected.ordinality
    ),
    '[]'::jsonb
  )
  into v_questions
  from unnest(v_attempt.question_ids) with ordinality as selected(question_id, ordinality)
  join public.questions as question
    on question.id = selected.question_id
  left join public.responses as response
    on response.attempt_id = v_attempt.id
   and response.question_id = question.id
  left join public.answer_keys as answer_key
    on answer_key.question_id = question.id;

  return jsonb_build_object(
    'id', v_attempt.id,
    'quiz_id', v_attempt.quiz_id,
    'title', v_quiz.title,
    'mode', v_attempt.mode,
    'completed_at', v_attempt.completed_at,
    'total', pg_catalog.cardinality(v_attempt.question_ids),
    'answered', v_answered,
    'correct', v_correct,
    'questions', v_questions
  );
end
$function$;

create or replace function public.submit_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_quiz public.quizzes%rowtype;
  v_question public.questions%rowtype;
  v_answer_key public.answer_keys%rowtype;
  v_existing_response jsonb;
  v_existing_correct boolean;
  v_correct boolean;
  v_completed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to submit an answer.';
  end if;

  select attempt.*
  into v_attempt
  from public.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Attempt not found for the current user.';
  end if;
  if v_attempt.mode = 'full_test' then
    raise exception 'Full-test responses must be submitted as a complete batch.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = v_attempt.quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Quiz access has been revoked or is unavailable.';
  end if;

  if p_question_id is null or not (p_question_id = any(v_attempt.question_ids)) then
    raise exception 'Question does not belong to this attempt.';
  end if;

  select question.*
  into v_question
  from public.questions as question
  where question.id = p_question_id;

  if not found then
    raise exception 'Question does not belong to this attempt.';
  end if;

  select response.response, response.correct
  into v_existing_response, v_existing_correct
  from public.responses as response
  where response.attempt_id = v_attempt.id
    and response.question_id = p_question_id;

  if found then
    if v_existing_response is distinct from p_response then
      if v_question.kind <> 'multiple'
         or jsonb_typeof(v_existing_response) is distinct from 'array'
         or jsonb_typeof(p_response) is distinct from 'array' then
        raise exception 'A submitted response cannot be changed.';
      end if;
      if jsonb_array_length(v_existing_response) <> jsonb_array_length(p_response)
         or not (v_existing_response @> p_response)
         or not (p_response @> v_existing_response) then
        raise exception 'A submitted response cannot be changed.';
      end if;
    end if;

    select answer_key.*
    into v_answer_key
    from public.answer_keys as answer_key
    where answer_key.question_id = p_question_id;

    return jsonb_build_object(
      'correct', v_existing_correct,
      'answer', v_answer_key.answer,
      'explanation', v_answer_key.explanation,
      'completed', v_attempt.completed_at is not null
    );
  end if;

  v_correct := private.score_response(p_question_id, p_response);

  select answer_key.*
  into v_answer_key
  from public.answer_keys as answer_key
  where answer_key.question_id = p_question_id;

  insert into public.responses (
    attempt_id,
    question_id,
    response,
    correct
  )
  values (
    v_attempt.id,
    v_question.id,
    p_response,
    v_correct
  );

  update public.attempts as attempt
  set completed_at = pg_catalog.now()
  where attempt.id = v_attempt.id
    and attempt.completed_at is null
    and (
      select pg_catalog.count(*)
      from public.responses as response
      where response.attempt_id = v_attempt.id
    ) = pg_catalog.cardinality(v_attempt.question_ids)
  returning attempt.completed_at into v_completed_at;

  if not found then
    v_completed_at := v_attempt.completed_at;
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'answer', v_answer_key.answer,
    'explanation', v_answer_key.explanation,
    'completed', v_completed_at is not null
  );
end
$function$;

create or replace function public.list_my_attempts()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required to list attempts.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', attempt.id,
          'quiz_id', attempt.quiz_id,
          'title', quiz.title,
          'mode', attempt.mode,
          'total', pg_catalog.cardinality(attempt.question_ids),
          'answered', stats.answered,
          'correct', stats.correct,
          'created_at', attempt.created_at,
          'completed_at', attempt.completed_at
        )
        order by attempt.created_at desc, attempt.id
      )
      from public.attempts as attempt
      join public.quizzes as quiz
        on quiz.id = attempt.quiz_id
      cross join lateral (
        select pg_catalog.count(*)::integer as answered,
               coalesce(pg_catalog.sum(case when response.correct then 1 else 0 end), 0)::integer as correct
        from public.responses as response
        where response.attempt_id = attempt.id
      ) as stats
      where attempt.user_id = v_user_id
    ),
    '[]'::jsonb
  );
end
$function$;

create function public.get_flashcard_deck(
  p_quiz_id uuid,
  p_categories text[],
  p_review_only boolean,
  p_shuffle boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
  v_questions jsonb;
  v_total integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to study flashcards.';
  end if;
  if p_review_only is null or p_shuffle is null then
    raise exception 'Review-only and shuffle options must be true or false.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = p_quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Quiz not found or not available for study.';
  end if;

  if p_categories is not null then
    if pg_catalog.cardinality(p_categories) = 0 then
      raise exception 'Category selection cannot be empty.';
    end if;
    if exists (
      select 1
      from pg_catalog.unnest(p_categories) as requested(category)
      where requested.category is null
         or regexp_replace(
           requested.category,
           '^[[:space:]]+|[[:space:]]+$',
           '',
           'g'
         ) = ''
         or not exists (
           select 1
           from public.questions as question
           where question.quiz_id = v_quiz.id
             and question.category = requested.category
         )
    ) then
      raise exception 'Category selection contains an unrecognized category.';
    end if;
  end if;

  select count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', question.id,
               'position', question.position,
               'category', question.category,
               'prompt', question.prompt,
               'choices', question.choices,
               'kind', question.kind,
               'rating', progress.rating
             )
             order by
               case when p_shuffle then pg_catalog.random() else null::double precision end,
               question.position
           ),
           '[]'::jsonb
         )
  into v_total, v_questions
  from public.questions as question
  left join public.flashcard_progress as progress
    on progress.question_id = question.id
   and progress.user_id = v_user_id
  where question.quiz_id = v_quiz.id
    and (p_categories is null or question.category = any(p_categories))
    and (not p_review_only or progress.rating = 'review');

  return jsonb_build_object(
    'quiz_id', v_quiz.id,
    'title', v_quiz.title,
    'total', v_total,
    'questions', v_questions
  );
end
$function$;

create function public.get_flashcard_answer(p_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_question public.questions%rowtype;
  v_quiz public.quizzes%rowtype;
  v_answer_key public.answer_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to reveal a flashcard.';
  end if;

  select question.*
  into v_question
  from public.questions as question
  where question.id = p_question_id;

  if not found then
    raise exception 'Flashcard not found or not available for study.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = v_question.quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Flashcard not found or not available for study.';
  end if;

  select answer_key.*
  into v_answer_key
  from public.answer_keys as answer_key
  where answer_key.question_id = v_question.id;

  if not found then
    raise exception 'Flashcard answer was not found.';
  end if;

  return jsonb_build_object(
    'question_id', v_question.id,
    'answer', v_answer_key.answer,
    'explanation', v_answer_key.explanation
  );
end
$function$;

create function public.rate_flashcard(p_question_id uuid, p_rating text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_question public.questions%rowtype;
  v_quiz public.quizzes%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to rate a flashcard.';
  end if;
  if p_rating is null or p_rating not in ('known', 'review') then
    raise exception 'Flashcard rating must be known or review.';
  end if;

  select question.*
  into v_question
  from public.questions as question
  where question.id = p_question_id;

  if not found then
    raise exception 'Flashcard not found or not available for study.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = v_question.quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Flashcard not found or not available for study.';
  end if;

  insert into public.flashcard_progress (user_id, question_id, rating, updated_at)
  values (v_user_id, v_question.id, p_rating, pg_catalog.now())
  on conflict (user_id, question_id)
  do update set rating = excluded.rating, updated_at = excluded.updated_at;

  return p_rating;
end
$function$;

create function public.submit_full_test(p_attempt_id uuid, p_responses jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_quiz public.quizzes%rowtype;
  v_item jsonb;
  v_question_id uuid;
  v_response jsonb;
  v_correct boolean;
  v_scored jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_answer_key public.answer_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to submit a full test.';
  end if;

  select attempt.*
  into v_attempt
  from public.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Attempt not found for the current user.';
  end if;
  if v_attempt.mode <> 'full_test' then
    raise exception 'Only full-test attempts accept batch submissions.';
  end if;
  if v_attempt.completed_at is not null then
    raise exception 'Full-test attempt has already been submitted.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = v_attempt.quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Quiz access has been revoked or is unavailable.';
  end if;

  if p_responses is null or jsonb_typeof(p_responses) is distinct from 'array' then
    raise exception 'Full-test responses must be a JSON array.';
  end if;
  if jsonb_array_length(p_responses) <> pg_catalog.cardinality(v_attempt.question_ids) then
    raise exception 'A full-test submission must include every question exactly once.';
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_responses) as item(value)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 2
       or jsonb_typeof(v_item->'question_id') is distinct from 'string'
       or not (v_item ? 'response') then
      raise exception 'Each full-test response must contain only question_id and response.';
    end if;

    begin
      v_question_id := (v_item->>'question_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Full-test question_id must be a UUID.';
    end;
    v_response := v_item->'response';

    if v_question_id is null or not (v_question_id = any(v_attempt.question_ids)) then
      raise exception 'Question does not belong to this full-test attempt.';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_scored) as previous(item)
      where (previous.item->>'question_id')::uuid = v_question_id
    ) then
      raise exception 'A full-test submission cannot contain duplicate questions.';
    end if;

    v_correct := private.score_response(v_question_id, v_response);
    v_scored := v_scored || jsonb_build_array(
      jsonb_build_object(
        'question_id', v_question_id,
        'response', v_response,
        'correct', v_correct
      )
    );
  end loop;

  if jsonb_array_length(v_scored) <> pg_catalog.cardinality(v_attempt.question_ids) then
    raise exception 'A full-test submission must include every question exactly once.';
  end if;

  insert into public.responses (attempt_id, question_id, response, correct)
  select
    v_attempt.id,
    (item.value->>'question_id')::uuid,
    item.value->'response',
    (item.value->>'correct')::boolean
  from jsonb_array_elements(v_scored) as item(value);

  update public.attempts as attempt
  set completed_at = pg_catalog.now()
  where attempt.id = v_attempt.id
  returning attempt.completed_at into v_attempt.completed_at;

  for v_item in
    select item.value
    from jsonb_array_elements(v_scored) as item(value)
  loop
    select answer_key.*
    into v_answer_key
    from public.answer_keys as answer_key
    where answer_key.question_id = (v_item->>'question_id')::uuid;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'question_id', (v_item->>'question_id')::uuid,
        'correct', (v_item->>'correct')::boolean,
        'answer', v_answer_key.answer,
        'explanation', v_answer_key.explanation
      )
    );
  end loop;

  return jsonb_build_object(
    'completed', true,
    'results', v_results
  );
end
$function$;

revoke all on function public.start_attempt(uuid, text[], boolean, text) from public, anon, authenticated;
revoke all on function public.get_flashcard_deck(uuid, text[], boolean, boolean) from public, anon, authenticated;
revoke all on function public.get_flashcard_answer(uuid) from public, anon, authenticated;
revoke all on function public.rate_flashcard(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_full_test(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.start_attempt(uuid, text[], boolean, text) to authenticated;
grant execute on function public.get_flashcard_deck(uuid, text[], boolean, boolean) to authenticated;
grant execute on function public.get_flashcard_answer(uuid) to authenticated;
grant execute on function public.rate_flashcard(uuid, text) to authenticated;
grant execute on function public.submit_full_test(uuid, jsonb) to authenticated;
