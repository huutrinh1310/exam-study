create function public.get_flashcard_answer_sheet(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
  v_question_count integer;
  v_answer_count integer;
  v_answers jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to view flashcard answers.';
  end if;

  select quiz.*
  into v_quiz
  from public.quizzes as quiz
  where quiz.id = p_quiz_id
  for share;

  if not found or (v_quiz.owner_id <> v_user_id and not v_quiz.is_shared) then
    raise exception 'Quiz not found or not available for study.';
  end if;

  select count(*)::integer,
         count(answer_key.question_id)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'question_id', question.id,
               'answer', answer_key.answer
             )
             order by question.position
           ) filter (where answer_key.question_id is not null),
           '[]'::jsonb
         )
  into v_question_count, v_answer_count, v_answers
  from public.questions as question
  left join public.answer_keys as answer_key
    on answer_key.question_id = question.id
  where question.quiz_id = v_quiz.id;

  if v_question_count <> v_answer_count then
    raise exception 'One or more flashcard answers were not found.';
  end if;

  return v_answers;
end
$function$;

revoke all on function public.get_flashcard_answer_sheet(uuid) from public, anon, authenticated;
grant execute on function public.get_flashcard_answer_sheet(uuid) to authenticated;
