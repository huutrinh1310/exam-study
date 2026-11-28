begin;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'task2-owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'task2-member@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'task2-stranger@example.test',
    '',
    now(),
    now(),
    now()
  )
on conflict (id) do nothing;

set local role authenticated;

do $test$
declare
  owner_id constant uuid := '00000000-0000-4000-8000-000000000001';
  member_id constant uuid := '00000000-0000-4000-8000-000000000002';
  stranger_id constant uuid := '00000000-0000-4000-8000-000000000003';
  quiz_id uuid;
  owner_attempt uuid;
  drag_attempt uuid;
  member_attempt uuid;
  partial_attempt uuid;
  full_attempt uuid;
  unfinished_full_attempt uuid;
  card_id uuid;
  attempt_data jsonb;
  attempt_questions jsonb;
  flashcard_deck jsonb;
  flashcard_answer jsonb;
  flashcard_answer_sheet jsonb;
  result jsonb;
  full_result jsonb;
  full_responses jsonb;
  answer_ids uuid[];
  failed boolean;
  write_failed boolean;
  visible_count integer;
  invalid_large_questions jsonb;
  question_payload jsonb := '[
    {
      "category": "Cloud",
      "prompt": "Choose the single answer",
      "choices": [{"label":"A","text":"First"},{"label":"B","text":"Second"}],
      "kind": "single",
      "answer": ["B"],
      "explanation": "Second is correct."
    },
    {
      "category": "Cloud",
      "prompt": "Choose both answers",
      "choices": [{"label":"A","text":"First"},{"label":"B","text":"Second"},{"label":"C","text":"Third"}],
      "kind": "multiple",
      "answer": ["A","C"],
      "explanation": "First and third are correct."
    },
    {
      "category": "Cloud",
      "prompt": "Mark each statement",
      "choices": [{"label":"A","text":"First"},{"label":"B","text":"Second"}],
      "kind": "yes_no",
      "answer": {"A":true,"B":false},
      "explanation": "The first is true and the second is false."
    }
  ]'::jsonb;
begin
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  quiz_id := public.create_quiz('Task 2 access checks', question_payload);
  if quiz_id is null then
    raise exception 'create_quiz returned no id';
  end if;

  flashcard_deck := public.get_flashcard_deck(quiz_id, null, false, false);
  if jsonb_array_length(flashcard_deck->'questions') <> 3
     or flashcard_deck ? 'answer'
     or flashcard_deck ? 'explanation'
     or exists (
       select 1
       from jsonb_array_elements(flashcard_deck->'questions') as card(question)
       where card.question ? 'answer' or card.question ? 'explanation'
     ) then
    raise exception 'flashcard deck exposed answer data or omitted questions';
  end if;
  card_id := (flashcard_deck->'questions'->0->>'id')::uuid;
  flashcard_answer := public.get_flashcard_answer(card_id);
  if flashcard_answer->>'question_id' <> card_id::text
     or flashcard_answer->'answer' <> '["B"]'::jsonb
     or flashcard_answer->>'explanation' <> 'Second is correct.' then
    raise exception 'authorized flashcard reveal returned incorrect feedback';
  end if;
  flashcard_answer_sheet := public.get_flashcard_answer_sheet(quiz_id);
  if jsonb_array_length(flashcard_answer_sheet) <> 3
     or not exists (
       select 1
       from jsonb_array_elements(flashcard_answer_sheet) as item(answer)
       where item.answer->>'question_id' = card_id::text
         and item.answer->'answer' = '["B"]'::jsonb
     ) then
    raise exception 'authorized flashcard answer sheet returned incorrect answers';
  end if;
  if public.rate_flashcard(card_id, 'known') <> 'known' then
    raise exception 'flashcard rating was not saved';
  end if;
  flashcard_deck := public.get_flashcard_deck(quiz_id, null, false, false);
  if flashcard_deck->'questions'->0->>'rating' <> 'known' then
    raise exception 'saved flashcard rating was not returned';
  end if;

  select count(*) into visible_count
  from public.quizzes
  where id = quiz_id;
  if visible_count <> 1 then
    raise exception 'quiz owner could not enumerate their quiz';
  end if;

  owner_attempt := public.start_attempt(quiz_id);
  if jsonb_array_length(public.list_my_attempts()) <> 1 then
    raise exception 'owner history did not include their own attempt';
  end if;
  if public.get_attempt(owner_attempt)->>'mode' <> 'practice' then
    raise exception 'existing attempts did not default to practice mode';
  end if;
  drag_attempt := public.start_attempt(quiz_id, null, false, 'drag_drop');
  if public.get_attempt(drag_attempt)->>'mode' <> 'drag_drop' then
    raise exception 'drag-and-drop mode was not recorded on the attempt';
  end if;

  perform public.set_quiz_sharing(quiz_id, true);
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  if (public.get_quiz_for_study(quiz_id)->>'is_shared')::boolean is not true then
    raise exception 'shared quiz was not available by UUID';
  end if;
  flashcard_deck := public.get_flashcard_deck(quiz_id, null, false, false);
  if jsonb_array_length(flashcard_deck->'questions') <> 3
     or exists (
       select 1
       from jsonb_array_elements(flashcard_deck->'questions') as card(question)
       where card.question ? 'answer' or card.question ? 'explanation'
     ) then
    raise exception 'shared flashcard deck exposed answer data or omitted questions';
  end if;
  if flashcard_deck->'questions'->0->>'rating' is not null then
    raise exception 'member saw another learner flashcard rating';
  end if;
  if public.rate_flashcard(card_id, 'review') <> 'review' then
    raise exception 'member flashcard rating was not saved';
  end if;
  if public.rate_flashcard(card_id, 'known') <> 'known'
     or public.rate_flashcard(card_id, 'review') <> 'review' then
    raise exception 'member flashcard rating was not updated';
  end if;
  flashcard_deck := public.get_flashcard_deck(quiz_id, null, true, false);
  if jsonb_array_length(flashcard_deck->'questions') <> 1
     or flashcard_deck->'questions'->0->>'id' <> card_id::text
     or flashcard_deck->'questions'->0->>'rating' <> 'review' then
    raise exception 'review-only flashcard deck did not filter by this member';
  end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  flashcard_deck := public.get_flashcard_deck(quiz_id, null, false, false);
  if flashcard_deck->'questions'->0->>'rating' <> 'known' then
    raise exception 'member rating overwrote the owner rating';
  end if;
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  flashcard_answer := public.get_flashcard_answer(card_id);
  if flashcard_answer->'answer' <> '["B"]'::jsonb then
    raise exception 'shared member could not explicitly reveal an authorized card';
  end if;
  flashcard_answer_sheet := public.get_flashcard_answer_sheet(quiz_id);
  if jsonb_array_length(flashcard_answer_sheet) <> 3
     or not exists (
       select 1
       from jsonb_array_elements(flashcard_answer_sheet) as item(answer)
       where item.answer->>'question_id' = card_id::text
         and item.answer->'answer' = '["B"]'::jsonb
     ) then
    raise exception 'shared member could not view the authorized flashcard answer sheet';
  end if;

  select count(*) into visible_count
  from public.quizzes
  where id = quiz_id;
  if visible_count <> 0 then
    raise exception 'shared quiz appeared in direct quiz enumeration';
  end if;

  write_failed := false;
  begin
    insert into public.quizzes (owner_id, title) values (member_id, 'Direct write');
  exception when insufficient_privilege then
    write_failed := true;
  end;
  if not write_failed then
    raise exception 'authenticated users can directly write quizzes';
  end if;

  write_failed := false;
  begin
    insert into public.questions (quiz_id, position, category, prompt, choices, kind)
    values (quiz_id, 99, 'Cloud', 'Direct write', '[]'::jsonb, 'single');
  exception when insufficient_privilege then
    write_failed := true;
  end;
  if not write_failed then
    raise exception 'authenticated users can directly write questions';
  end if;

  write_failed := false;
  begin
    insert into public.answer_keys (question_id, answer, explanation)
    values ('00000000-0000-4000-8000-000000000099', '[]'::jsonb, '');
  exception when insufficient_privilege then
    write_failed := true;
  end;
  if not write_failed then
    raise exception 'authenticated users can directly write answer keys';
  end if;

  write_failed := false;
  begin
    insert into public.attempts (user_id, quiz_id, question_ids)
    values (member_id, quiz_id, array['00000000-0000-4000-8000-000000000099'::uuid]);
  exception when insufficient_privilege then
    write_failed := true;
  end;
  if not write_failed then
    raise exception 'authenticated users can directly write attempts';
  end if;

  write_failed := false;
  begin
    insert into public.responses (attempt_id, question_id, response, correct)
    values (
      '00000000-0000-4000-8000-000000000099',
      '00000000-0000-4000-8000-000000000099',
      '[]'::jsonb,
      false
    );
  exception when insufficient_privilege then
    write_failed := true;
  end;
  if not write_failed then
    raise exception 'authenticated users can directly write responses';
  end if;

  failed := false;
  begin
    perform count(*) from public.questions;
  exception when insufficient_privilege then
    failed := true;
  end;
  if not failed then
    raise exception 'authenticated users can directly read questions';
  end if;

  failed := false;
  begin
    perform count(*) from public.answer_keys;
  exception when insufficient_privilege then
    failed := true;
  end;
  if not failed then
    raise exception 'authenticated users can directly read answer keys';
  end if;

  member_attempt := public.start_attempt(quiz_id, null, false, 'practice');
  if jsonb_array_length(public.list_my_attempts()) <> 1 then
    raise exception 'member history did not include their practice attempt';
  end if;
  attempt_data := public.get_attempt(member_attempt);
  if attempt_data->>'mode' <> 'practice' then
    raise exception 'practice mode was not recorded on the attempt';
  end if;
  attempt_questions := attempt_data->'questions';
  answer_ids := array(
    select (q.question->>'id')::uuid
    from jsonb_array_elements(attempt_questions) with ordinality as q(question, n)
    order by n
  );
  full_attempt := public.start_attempt(quiz_id, null, false, 'full_test');
  unfinished_full_attempt := public.start_attempt(quiz_id, null, false, 'full_test');
  attempt_data := public.get_attempt(full_attempt);
  if attempt_data->>'mode' <> 'full_test'
     or (attempt_data->>'answered')::integer <> 0
     or exists (
       select 1
       from jsonb_array_elements(attempt_data->'questions') as q(question)
       where q.question ? 'answer'
          or q.question->'response' <> 'null'::jsonb
          or q.question->'feedback' <> 'null'::jsonb
     ) then
    raise exception 'full-test draft exposed answer data before submission';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(public.list_my_attempts()) as history(item)
    where history.item->>'id' = unfinished_full_attempt::text
      and history.item->>'mode' = 'full_test'
  ) then
    raise exception 'unfinished full-test attempt was missing from history';
  end if;
  attempt_data := public.get_attempt(unfinished_full_attempt);
  if attempt_data->>'mode' <> 'full_test'
     or (attempt_data->>'answered')::integer <> 0 then
    raise exception 'unfinished full-test attempt could not be reopened';
  end if;
  full_responses := jsonb_build_array(
    jsonb_build_object('question_id', answer_ids[1], 'response', '["B"]'::jsonb),
    jsonb_build_object('question_id', answer_ids[2], 'response', '["A","C"]'::jsonb),
    jsonb_build_object(
      'question_id', answer_ids[3],
      'response',
      '{"A":true,"B":false}'::jsonb
    )
  );
  failed := false;
  begin
    perform public.submit_answer(full_attempt, answer_ids[1], '["B"]'::jsonb);
  exception when others then
    failed := true;
  end;
  if not failed or (public.get_attempt(full_attempt)->>'answered')::integer <> 0 then
    raise exception 'single-answer RPC revealed or persisted a full-test response';
  end if;
  failed := false;
  begin
    perform public.submit_full_test(
      full_attempt,
      full_responses - 2
    );
  exception when others then
    failed := true;
  end;
  if not failed or (public.get_attempt(full_attempt)->>'answered')::integer <> 0 then
    raise exception 'incomplete full-test submission persisted responses';
  end if;
  failed := false;
  begin
    perform public.submit_full_test(
      full_attempt,
      jsonb_build_array(
        full_responses->0,
        full_responses->0,
        full_responses->2
      )
    );
  exception when others then
    failed := true;
  end;
  if not failed or (public.get_attempt(full_attempt)->>'answered')::integer <> 0 then
    raise exception 'duplicate full-test question persisted responses';
  end if;
  failed := false;
  begin
    perform public.submit_full_test(
      full_attempt,
      jsonb_build_array(
        full_responses->0,
        full_responses->1,
        jsonb_build_object(
          'question_id',
          '00000000-0000-4000-8000-000000000099',
          'response',
          '["A"]'::jsonb
        )
      )
    );
  exception when others then
    failed := true;
  end;
  if not failed or (public.get_attempt(full_attempt)->>'answered')::integer <> 0 then
    raise exception 'foreign-question full-test submission persisted responses';
  end if;
  failed := false;
  begin
    perform public.submit_full_test(
      full_attempt,
      jsonb_build_array(
        full_responses->0,
        full_responses->1,
        jsonb_build_object('question_id', answer_ids[3])
      )
    );
  exception when others then
    failed := true;
  end;
  if not failed or (public.get_attempt(full_attempt)->>'answered')::integer <> 0 then
    raise exception 'malformed full-test submission persisted responses';
  end if;
  failed := false;
  begin
    perform public.submit_full_test(
      full_attempt,
      jsonb_build_array(
        full_responses->0,
        full_responses->1,
        jsonb_build_object('question_id', answer_ids[3], 'response', '{"A":true}'::jsonb)
      )
    );
  exception when others then
    failed := true;
  end;
  if not failed or (public.get_attempt(full_attempt)->>'answered')::integer <> 0 then
    raise exception 'invalid full-test response persisted partial results';
  end if;
  full_result := public.submit_full_test(full_attempt, full_responses);
  if full_result->>'completed' <> 'true'
     or jsonb_array_length(full_result->'results') <> 3
     or full_result->'results'->0->'answer' <> '["B"]'::jsonb
     or full_result->'results'->1->'answer' <> '["A","C"]'::jsonb
     or full_result->'results'->2->'answer' <> '{"A":true,"B":false}'::jsonb
     or full_result->'results'->0->>'explanation' <> 'Second is correct.'
     or full_result->'results'->1->>'explanation' <> 'First and third are correct.'
     or full_result->'results'->2->>'explanation' <> 'The first is true and the second is false.'
     or full_result->'results'->0->>'correct' <> 'true'
     or full_result->'results'->1->>'correct' <> 'true'
     or full_result->'results'->2->>'correct' <> 'true'
     or (public.get_attempt(full_attempt)->>'answered')::integer <> 3
     or public.get_attempt(full_attempt)->>'completed_at' is null then
    raise exception 'full-test batch did not score, return feedback, and complete';
  end if;

  attempt_data := public.get_attempt(member_attempt);
  attempt_questions := attempt_data->'questions';
  if jsonb_array_length(attempt_questions) <> 3 then
    raise exception 'attempt did not contain all questions';
  end if;

  failed := false;
  begin
    perform public.set_quiz_sharing(quiz_id, false);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'non-owner could change quiz sharing';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(attempt_questions) as q(question)
    where q.question->'response' <> 'null'::jsonb
       or q.question->'feedback' <> 'null'::jsonb
       or q.question ? 'answer'
  ) then
    raise exception 'unsubmitted attempt revealed learner response or feedback';
  end if;

  answer_ids := array(
    select (q.question->>'id')::uuid
    from jsonb_array_elements(attempt_questions) with ordinality as q(question, n)
    order by n
  );
  failed := false;
  begin
    perform public.submit_answer(
      member_attempt,
      '00000000-0000-4000-8000-000000000099',
      '["A"]'::jsonb
    );
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'forged question id was accepted';
  end if;

  result := public.submit_answer(member_attempt, answer_ids[1], '["A"]'::jsonb);
  if result->>'correct' <> 'false'
     or result->'answer' <> '["B"]'::jsonb
     or result->>'explanation' <> 'Second is correct.' then
    raise exception 'single-answer scoring or post-submit feedback was incorrect';
  end if;
  attempt_data := public.get_attempt(member_attempt);
  if attempt_data->'questions'->0->'feedback'->>'correct' <> 'false'
     or attempt_data->'questions'->0->'feedback'->'answer' <> '["B"]'::jsonb
     or attempt_data->'questions'->1->'feedback' <> 'null'::jsonb
     or attempt_data->'questions'->2->'feedback' <> 'null'::jsonb then
    raise exception 'attempt revealed feedback before that question was submitted';
  end if;

  if public.submit_answer(member_attempt, answer_ids[1], '["A"]'::jsonb) <> result then
    raise exception 'identical response replay did not return identical feedback';
  end if;

  failed := false;
  begin
    perform public.submit_answer(member_attempt, answer_ids[1], '["B"]'::jsonb);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'changed response replay was accepted';
  end if;

  partial_attempt := public.start_attempt(quiz_id, array['Cloud'], false);
  attempt_data := public.get_attempt(partial_attempt);
  result := public.submit_answer(
    partial_attempt,
    (attempt_data->'questions'->1->>'id')::uuid,
    '["A"]'::jsonb
  );
  if result->>'correct' <> 'false' then
    raise exception 'a valid partial multiple-answer response was not scored as incorrect';
  end if;

  result := public.submit_answer(member_attempt, answer_ids[2], '["C","A"]'::jsonb);
  if result->>'correct' <> 'true' or result->'answer' <> '["A","C"]'::jsonb then
    raise exception 'multiple-answer set scoring was incorrect';
  end if;
  if public.submit_answer(member_attempt, answer_ids[2], '["A","C"]'::jsonb) <> result then
    raise exception 'reordered multiple response replay did not return the same feedback';
  end if;

  result := public.submit_answer(
    member_attempt,
    answer_ids[3],
    '{"A":true,"B":false}'::jsonb
  );
  if result->>'correct' <> 'true' or result->>'completed' <> 'true' then
    raise exception 'yes/no scoring or attempt completion was incorrect';
  end if;

  failed := false;
  begin
    perform public.submit_answer(member_attempt, answer_ids[3], '{"A":true}'::jsonb);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'invalid yes/no response was accepted';
  end if;

  if jsonb_array_length(public.list_my_attempts()) <> 4 then
    raise exception 'member history did not contain exactly their own attempts';
  end if;

  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  select count(*) into visible_count from public.quizzes where id = quiz_id;
  if visible_count <> 0 or jsonb_array_length(public.list_my_attempts()) <> 0 then
    raise exception 'stranger could enumerate quiz or another user history';
  end if;
  if public.get_quiz_for_study(quiz_id)->>'id' <> quiz_id::text then
    raise exception 'authenticated UUID holder could not study the shared quiz';
  end if;
  perform public.start_attempt(quiz_id, null, false);
  if jsonb_array_length(public.list_my_attempts()) <> 1 then
    raise exception 'stranger history did not contain their own attempt';
  end if;
  failed := false;
  begin
    perform public.get_attempt(member_attempt);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'stranger could read another user attempt';
  end if;
  failed := false;
  begin
    perform public.submit_full_test(unfinished_full_attempt, full_responses);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'stranger could submit another user full-test attempt';
  end if;
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  if (public.get_attempt(unfinished_full_attempt)->>'answered')::integer <> 0 then
    raise exception 'stranger full-test submission persisted responses';
  end if;

  failed := false;
  begin
    perform public.start_attempt(quiz_id, array['Not a category'], false);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'unrecognized category was accepted';
  end if;

  failed := false;
  begin
    perform public.start_attempt(quiz_id, array[]::text[], false);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'empty category result was accepted';
  end if;

  failed := false;
  begin
    perform public.start_attempt(quiz_id, null, false, 'invalid');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'unrecognized attempt mode was accepted';
  end if;

  failed := false;
  begin
    perform public.create_quiz('Invalid answer', '[{
      "category":"Cloud","prompt":"Bad answer",
      "choices":[{"label":"A","text":"A"},{"label":"B","text":"B"}],
      "kind":"single","answer":["C"],"explanation":"Invalid reference"
    }]'::jsonb);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'create_quiz accepted an answer that references no choice';
  end if;

  failed := false;
  begin
    perform public.create_quiz('   ', question_payload);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'create_quiz accepted a blank title';
  end if;

  failed := false;
  begin
    perform public.create_quiz(E' \t\n ', question_payload);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'create_quiz accepted a title containing only whitespace';
  end if;

  failed := false;
  begin
    perform public.create_quiz('Invalid yes/no keys', '[{
      "category":"Cloud","prompt":"Bad yes/no answer",
      "choices":[{"label":"A","text":"A"},{"label":"B","text":"B"}],
      "kind":"yes_no","answer":{"A":true,"B":false,"C":true},
      "explanation":"Invalid extra key"
    }]'::jsonb);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'create_quiz accepted an extra yes/no answer key';
  end if;

  failed := false;
  begin
    perform public.create_quiz('Invalid choice labels', '[{
      "category":"Cloud","prompt":"Duplicate choices",
      "choices":[{"label":"A","text":"First"},{"label":"A","text":"Second"}],
      "kind":"single","answer":["A"],"explanation":"Invalid duplicate"
    }]'::jsonb);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'create_quiz accepted duplicate choice labels';
  end if;

  failed := false;
  begin
    perform public.create_quiz('Invalid answer cardinality', '[{
      "category":"Cloud","prompt":"Too many answers",
      "choices":[{"label":"A","text":"First"},{"label":"B","text":"Second"}],
      "kind":"single","answer":["A","B"],"explanation":"Invalid cardinality"
    }]'::jsonb);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'create_quiz accepted multiple answers for a single question';
  end if;

  failed := false;
  begin
    perform public.create_quiz('Invalid prompt length', jsonb_build_array(
      jsonb_build_object(
        'category', 'Cloud',
        'prompt', repeat('x', 10001),
        'choices', '[{"label":"A","text":"A"},{"label":"B","text":"B"}]'::jsonb,
        'kind', 'single',
        'answer', '["A"]'::jsonb,
        'explanation', ''
      )
    ));
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'create_quiz accepted a prompt beyond its text bound';
  end if;

  select jsonb_agg(question_payload->0 order by generated.position)
  into invalid_large_questions
  from generate_series(1, 1001) as generated(position);
  failed := false;
  begin
    perform public.create_quiz('Too many questions', invalid_large_questions);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'create_quiz accepted more than 1000 questions';
  end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform public.set_quiz_sharing(quiz_id, false);
  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  failed := false;
  begin
    perform public.get_flashcard_deck(quiz_id, null, false, false);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'stranger could read an unavailable flashcard deck';
  end if;
  failed := false;
  begin
    perform public.get_flashcard_answer(card_id);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'stranger could reveal an unavailable flashcard answer';
  end if;
  failed := false;
  begin
    perform public.get_flashcard_answer_sheet(quiz_id);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'stranger could view answers for an unavailable quiz';
  end if;
  failed := false;
  begin
    perform public.rate_flashcard(card_id, 'known');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'stranger could rate a card in an unavailable quiz';
  end if;

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  if jsonb_array_length(public.list_my_attempts()) <> 4 then
    raise exception 'revoked member lost allowed history metadata';
  end if;

  failed := false;
  begin
    perform public.get_attempt(member_attempt);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'revoked member could read old attempt question data';
  end if;

  failed := false;
  begin
    perform public.submit_answer(member_attempt, answer_ids[3], '{"A":true,"B":false}'::jsonb);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'revoked member could submit to an old attempt';
  end if;

  failed := false;
  begin
    perform public.submit_full_test(unfinished_full_attempt, full_responses);
  exception when others then
    failed := true;
  end;
  if not failed or not exists (
    select 1
    from jsonb_array_elements(public.list_my_attempts()) as history(item)
    where history.item->>'id' = unfinished_full_attempt::text
      and (history.item->>'answered')::integer = 0
  ) then
    raise exception 'revoked member could submit an old full-test attempt';
  end if;

  failed := false;
  begin
    perform public.start_attempt(quiz_id, null, false);
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'revoked member could start a new attempt';
  end if;
end
$test$;

rollback;
