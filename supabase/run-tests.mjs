import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "./migrations/202611180001_initial.sql",
  import.meta.url,
);
const testsUrl = new URL("./tests/access.sql", import.meta.url);
const migration = await readFile(fileURLToPath(migrationUrl), "utf8");
const tests = await readFile(fileURLToPath(testsUrl), "utf8");

const db = new PGlite();

try {
  const [{ version }] = (await db.query("select version() as version")).rows;
  console.log(`Database: ${version}`);

  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;

    create table auth.users (
      id uuid primary key,
      instance_id uuid,
      aud text,
      role text,
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    );

    create function auth.uid()
    returns uuid
    language sql
    stable
    set search_path = pg_catalog
    as $function$
      select nullif(
        pg_catalog.current_setting('request.jwt.claim.sub', true),
        ''
      )::uuid
    $function$;
  `);
  console.log("Bootstrap: roles, auth.users, and auth.uid() ready");

  await db.exec(migration);
  console.log("Migration: supabase/migrations/202611180001_initial.sql applied");

  const tables = await db.query(`
    select
      relation.relname,
      relation.relrowsecurity as rls_enabled,
      has_table_privilege('anon', relation.oid, 'select') as anon_select,
      has_table_privilege('authenticated', relation.oid, 'select') as authenticated_select
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as schema on schema.oid = relation.relnamespace
    where schema.nspname = 'public'
      and relation.relkind = 'r'
    order by relation.relname
  `);
  assert.equal(tables.rows.length, 5, "expected five public tables");
  for (const table of tables.rows) {
    assert.equal(table.rls_enabled, true, `${table.relname} must enable RLS`);
    assert.equal(table.anon_select, false, `${table.relname} must not be readable by anon`);
    assert.equal(
      table.authenticated_select,
      table.relname === "quizzes",
      `${table.relname} has unexpected authenticated SELECT access`,
    );
  }

  const rpcNames = [
    "create_quiz",
    "set_quiz_sharing",
    "get_quiz_for_study",
    "start_attempt",
    "get_attempt",
    "submit_answer",
    "list_my_attempts",
  ];
  const rpcs = await db.query(
    `
      select
        procedure.proname,
        procedure.prosecdef as security_definer,
        procedure.proconfig as configuration,
        has_function_privilege('anon', procedure.oid, 'execute') as anon_execute,
        has_function_privilege('authenticated', procedure.oid, 'execute') as authenticated_execute
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as schema on schema.oid = procedure.pronamespace
      where schema.nspname = 'public'
      order by procedure.proname
    `,
  );
  assert.equal(rpcs.rows.length, rpcNames.length, "all seven RPCs must exist");
  assert.deepEqual(
    rpcs.rows.map(({ proname }) => proname),
    [...rpcNames].sort(),
    "public must contain only the seven declared RPCs",
  );
  for (const rpc of rpcs.rows) {
    assert.equal(rpc.security_definer, true, `${rpc.proname} must be SECURITY DEFINER`);
    assert.ok(
      rpc.configuration?.includes("search_path=pg_catalog, public, auth"),
      `${rpc.proname} must have the fixed search_path`,
    );
    assert.equal(rpc.anon_execute, false, `${rpc.proname} must not be executable by anon`);
    assert.equal(
      rpc.authenticated_execute,
      true,
      `${rpc.proname} must be executable by authenticated`,
    );
  }
  console.log("Catalog checks: RLS, direct read access, and RPC grants passed");

  await db.exec(tests);
  console.log("SQL tests: supabase/tests/access.sql passed (transaction rolled back)");
} catch (error) {
  console.error(`Database test failed${error.code ? ` (${error.code})` : ""}: ${error.message}`);
  if (error.where) console.error(error.where);
  if (error.hint) console.error(`Hint: ${error.hint}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
