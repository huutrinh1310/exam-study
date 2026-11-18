create table public.quizzes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default pg_catalog.now(),
  is_shared boolean not null default false,
  question_count integer not null default 0,
  constraint quizzes_title_length check (
    pg_catalog.char_length(title) between 1 and 120
  ),
  constraint quizzes_question_count_nonnegative check (question_count >= 0)
);

create table public.questions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  position integer not null,
  category text not null,
  prompt text not null,
  choices jsonb not null,
  kind text not null,
  constraint questions_quiz_position_unique unique (quiz_id, position),
  constraint questions_position_nonnegative check (position >= 0),
  constraint questions_kind_valid check (kind in ('single', 'multiple', 'yes_no'))
);

create table public.answer_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  answer jsonb not null,
  explanation text not null
);

create table public.attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  question_ids uuid[] not null,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint attempts_question_ids_nonempty check (
    pg_catalog.cardinality(question_ids) > 0
  )
);

create table public.responses (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  response jsonb not null,
  correct boolean not null,
  submitted_at timestamptz not null default pg_catalog.now(),
  constraint responses_attempt_question_unique unique (attempt_id, question_id)
);

alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.answer_keys enable row level security;
alter table public.attempts enable row level security;
alter table public.responses enable row level security;

create policy quizzes_owner_select
  on public.quizzes
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

revoke all on table public.quizzes from public, anon, authenticated;
revoke all on table public.questions from public, anon, authenticated;
revoke all on table public.answer_keys from public, anon, authenticated;
revoke all on table public.attempts from public, anon, authenticated;
revoke all on table public.responses from public, anon, authenticated;
grant select on table public.quizzes to authenticated;
grant usage on schema public to authenticated;

create function public.create_quiz(p_title text, p_questions jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_title text;
  v_quiz_id uuid;
  v_question jsonb;
  v_choice jsonb;
  v_position integer := 0;
  v_category text;
  v_prompt text;
  v_explanation text;
  v_kind text;
  v_label text;
  v_choice_text text;
  v_question_id uuid;
  v_labels text[];
  v_answer_labels text[];
  v_choices jsonb;
  v_answer jsonb;
  v_choice_count integer;
  v_answer_min integer;
  v_answer_max integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to create a quiz.';
  end if;

  if p_title is null then
    raise exception 'Quiz title is required.';
  end if;
  v_title := regexp_replace(p_title, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if v_title = '' or pg_catalog.char_length(v_title) > 120 then
    raise exception 'Quiz title must be nonempty and at most 120 characters.';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Questions must be a JSON array.';
  end if;
  if jsonb_array_length(p_questions) < 1 then
    raise exception 'A quiz must contain at least one question.';
  end if;
  if jsonb_array_length(p_questions) > 1000 then
    raise exception 'A quiz cannot contain more than 1000 questions.';
  end if;

  insert into public.quizzes (owner_id, title, question_count)
  values (v_user_id, v_title, jsonb_array_length(p_questions))
  returning id into v_quiz_id;

  for v_question in
    select item.value
    from jsonb_array_elements(p_questions) as item(value)
  loop
    if jsonb_typeof(v_question) is distinct from 'object' then
      raise exception 'Question % must be a JSON object.', v_position + 1;
    end if;

    if jsonb_typeof(v_question->'category') is distinct from 'string' then
      raise exception 'Question % category must be text.', v_position + 1;
    end if;
    v_category := regexp_replace(
      v_question->>'category',
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    );
    if v_category = '' or pg_catalog.char_length(v_category) > 100 then
      raise exception 'Question % category must be nonempty and at most 100 characters.', v_position + 1;
    end if;

    if jsonb_typeof(v_question->'prompt') is distinct from 'string' then
      raise exception 'Question % prompt must be text.', v_position + 1;
    end if;
    v_prompt := regexp_replace(
      v_question->>'prompt',
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    );
    if v_prompt = '' or pg_catalog.char_length(v_prompt) > 10000 then
      raise exception 'Question % prompt must be nonempty and at most 10000 characters.', v_position + 1;
    end if;

    if jsonb_typeof(v_question->'explanation') is distinct from 'string' then
      raise exception 'Question % explanation must be text.', v_position + 1;
    end if;
    v_explanation := regexp_replace(
      v_question->>'explanation',
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    );
    if pg_catalog.char_length(v_explanation) > 20000 then
      raise exception 'Question % explanation cannot exceed 20000 characters.', v_position + 1;
    end if;

    if jsonb_typeof(v_question->'kind') is distinct from 'string' then
      raise exception 'Question % kind must be text.', v_position + 1;
    end if;
    v_kind := v_question->>'kind';
    if v_kind not in ('single', 'multiple', 'yes_no') then
      raise exception 'Question % kind must be single, multiple, or yes_no.', v_position + 1;
    end if;

    if jsonb_typeof(v_question->'choices') is distinct from 'array' then
      raise exception 'Question % choices must be a JSON array.', v_position + 1;
    end if;
    v_choice_count := jsonb_array_length(v_question->'choices');
    if v_choice_count < 2 or v_choice_count > 6 then
      raise exception 'Question % must have between 2 and 6 choices.', v_position + 1;
    end if;

    v_labels := array[]::text[];
    v_choices := '[]'::jsonb;
    for v_choice in
      select item.value
      from jsonb_array_elements(v_question->'choices') as item(value)
    loop
      if jsonb_typeof(v_choice) is distinct from 'object' then
        raise exception 'Question % choices must be objects.', v_position + 1;
      end if;
      if jsonb_typeof(v_choice->'label') is distinct from 'string' then
        raise exception 'Question % choice labels must be text.', v_position + 1;
      end if;
      v_label := v_choice->>'label';
      if v_label not in ('A', 'B', 'C', 'D', 'E', 'F') then
        raise exception 'Question % choice labels must be A through F.', v_position + 1;
      end if;
      if v_label = any(v_labels) then
        raise exception 'Question % choice labels must be distinct.', v_position + 1;
      end if;
      if jsonb_typeof(v_choice->'text') is distinct from 'string' then
        raise exception 'Question % choice text must be text.', v_position + 1;
      end if;
      v_choice_text := regexp_replace(
        v_choice->>'text',
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
      );
      if v_choice_text = '' or pg_catalog.char_length(v_choice_text) > 5000 then
        raise exception 'Question % choice text must be nonempty and at most 5000 characters.', v_position + 1;
      end if;

      v_labels := pg_catalog.array_append(v_labels, v_label);
      v_choices := v_choices || jsonb_build_array(
        jsonb_build_object('label', v_label, 'text', v_choice_text)
      );
    end loop;

    v_answer := v_question->'answer';
    if v_kind in ('single', 'multiple') then
      if jsonb_typeof(v_answer) is distinct from 'array' then
        raise exception 'Question % answer must match its kind.', v_position + 1;
      end if;
      if v_kind = 'single' then
        v_answer_min := 1;
        v_answer_max := 1;
      else
        v_answer_min := 2;
        v_answer_max := 6;
      end if;
      if jsonb_array_length(v_answer) < v_answer_min
         or jsonb_array_length(v_answer) > v_answer_max then
        raise exception 'Question % answer has the wrong number of labels for kind %.', v_position + 1, v_kind;
      end if;
      if exists (
        select 1
        from jsonb_array_elements(v_answer) as answer_item(value)
        where jsonb_typeof(answer_item.value) is distinct from 'string'
      ) then
        raise exception 'Question % answer labels must be text.', v_position + 1;
      end if;
      select coalesce(
        pg_catalog.array_agg(answer_item.value #>> '{}'),
        array[]::text[]
      )
      into v_answer_labels
      from jsonb_array_elements(v_answer) as answer_item(value);

      if pg_catalog.cardinality(v_answer_labels) <>
         (select pg_catalog.count(distinct label) from pg_catalog.unnest(v_answer_labels) as labels(label)) then
        raise exception 'Question % answer labels must be distinct.', v_position + 1;
      end if;
      if exists (
        select 1
        from pg_catalog.unnest(v_answer_labels) as labels(label)
        where not (labels.label = any(v_labels))
      ) then
        raise exception 'Question % answers must reference available choice labels.', v_position + 1;
      end if;
    else
      if jsonb_typeof(v_answer) is distinct from 'object' then
        raise exception 'Question % answer must match its kind.', v_position + 1;
      end if;
      if (select count(*) from pg_catalog.jsonb_object_keys(v_answer)) <> v_choice_count then
        raise exception 'Question % yes/no answer must include exactly one value per choice.', v_position + 1;
      end if;
      if exists (
        select 1
        from jsonb_object_keys(v_answer) as answer_key(label)
        where not (answer_key.label = any(v_labels))
      ) or exists (
        select 1
        from pg_catalog.unnest(v_labels) as labels(label)
        where not (v_answer ? labels.label)
      ) then
        raise exception 'Question % yes/no answer keys must match its choice labels exactly.', v_position + 1;
      end if;
      if exists (
        select 1
        from jsonb_each(v_answer) as answer_entry(label, value)
        where jsonb_typeof(answer_entry.value) is distinct from 'boolean'
      ) then
        raise exception 'Question % yes/no answers must be booleans.', v_position + 1;
      end if;
    end if;

    insert into public.questions (
      quiz_id,
      position,
      category,
      prompt,
      choices,
      kind
    )
    values (
      v_quiz_id,
      v_position,
      v_category,
      v_prompt,
      v_choices,
      v_kind
    )
    returning id into v_question_id;

    insert into public.answer_keys (question_id, answer, explanation)
    values (v_question_id, v_answer, v_explanation);

    v_position := v_position + 1;
  end loop;

  return v_quiz_id;
end
$function$;

create function public.set_quiz_sharing(p_quiz_id uuid, p_shared boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to change quiz sharing.';
  end if;
  if p_shared is null then
    raise exception 'Sharing state must be true or false.';
  end if;

  select quiz.owner_id
  into v_owner_id
  from public.quizzes as quiz
  where quiz.id = p_quiz_id
  for update;

  if not found or v_owner_id <> v_user_id then
    raise exception 'Quiz not found or not owned by the current user.';
  end if;

  update public.quizzes as quiz
  set is_shared = p_shared
  where quiz.id = p_quiz_id;

  return p_shared;
end
$function$;

create function public.get_quiz_for_study(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to study a quiz.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = p_quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Quiz not found or not available for study.';
  end if;

  return jsonb_build_object(
    'id', v_quiz.id,
    'title', v_quiz.title,
    'owner_id', v_quiz.owner_id,
    'is_shared', v_quiz.is_shared,
    'question_count', v_quiz.question_count,
    'categories', coalesce(
      (
        select jsonb_agg(categories.category order by categories.category)
        from (
          select distinct question.category
          from public.questions as question
          where question.quiz_id = v_quiz.id
        ) as categories
      ),
      '[]'::jsonb
    )
  );
end
$function$;

create function public.start_attempt(
  p_quiz_id uuid,
  p_categories text[] default null,
  p_shuffle boolean default false
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

  insert into public.attempts (user_id, quiz_id, question_ids)
  values (v_user_id, v_quiz.id, v_question_ids)
  returning id into v_attempt_id;

  return v_attempt_id;
end
$function$;

create function public.get_attempt(p_attempt_id uuid)
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
    'completed_at', v_attempt.completed_at,
    'total', pg_catalog.cardinality(v_attempt.question_ids),
    'answered', v_answered,
    'correct', v_correct,
    'questions', v_questions
  );
end
$function$;

create function public.submit_answer(
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
  v_labels text[];
  v_response_labels text[];
  v_completed_at timestamptz;
  v_correct boolean;
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

  select response.response
  into v_existing_response
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

    select response.correct
    into v_correct
    from public.responses as response
    where response.attempt_id = v_attempt.id
      and response.question_id = p_question_id;

    return jsonb_build_object(
      'correct', v_correct,
      'answer', v_answer_key.answer,
      'explanation', v_answer_key.explanation,
      'completed', v_attempt.completed_at is not null
    );
  end if;

  select answer_key.*
  into v_answer_key
  from public.answer_keys as answer_key
  where answer_key.question_id = p_question_id;

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
       (select pg_catalog.count(distinct label) from pg_catalog.unnest(v_response_labels) as labels(label)) then
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
      v_correct := p_response = v_answer_key.answer;
    else
      v_correct :=
        jsonb_array_length(p_response) = jsonb_array_length(v_answer_key.answer)
        and not exists (
          select 1
          from jsonb_array_elements(p_response) as response_item(value)
          where not (v_answer_key.answer @> jsonb_build_array(response_item.value))
        );
    end if;
  elsif v_question.kind = 'yes_no' then
    if jsonb_typeof(p_response) is distinct from 'object' then
      raise exception 'Yes/no response must be an object of booleans.';
    end if;
    if (select count(*) from pg_catalog.jsonb_object_keys(p_response)) <> pg_catalog.cardinality(v_labels) then
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
    v_correct := p_response = v_answer_key.answer;
  else
    raise exception 'Question kind is invalid.';
  end if;

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

create function public.list_my_attempts()
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

revoke all on function public.create_quiz(text, jsonb) from public, anon, authenticated;
revoke all on function public.set_quiz_sharing(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_quiz_for_study(uuid) from public, anon, authenticated;
revoke all on function public.start_attempt(uuid, text[], boolean) from public, anon, authenticated;
revoke all on function public.get_attempt(uuid) from public, anon, authenticated;
revoke all on function public.submit_answer(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.list_my_attempts() from public, anon, authenticated;

grant execute on function public.create_quiz(text, jsonb) to authenticated;
grant execute on function public.set_quiz_sharing(uuid, boolean) to authenticated;
grant execute on function public.get_quiz_for_study(uuid) to authenticated;
grant execute on function public.start_attempt(uuid, text[], boolean) to authenticated;
grant execute on function public.get_attempt(uuid) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, jsonb) to authenticated;
grant execute on function public.list_my_attempts() to authenticated;
