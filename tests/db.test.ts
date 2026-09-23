import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execAsync = promisify(execFile)
const ROOT = resolve(import.meta.dirname, '..')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const DENIED = '33333333-3333-4333-8333-333333333333'

function commandExists(name: string) {
  try { execFileSync('which', [name], { stdio: 'ignore' }); return true } catch { return false }
}

test('실제 PostgreSQL에서 초대, 재사용, 부분 성공, 한도 및 동시 요청을 검증한다',
  { skip: !['initdb', 'pg_ctl', 'psql'].every(commandExists) }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'readly-db-'))
  const port = String(52000 + Math.floor(Math.random() * 10000))
  const env = { ...process.env, PGHOST: dir, PGPORT: port, PGUSER: process.env.USER, PGDATABASE: 'postgres' }
  const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { env, encoding: 'utf8', maxBuffer: 2_000_000 }).trim()
  const query = (statement: string) => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement])
  const queryAsync = async (statement: string) => {
    const { stdout } = await execAsync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], { env })
    return stdout.trim()
  }
  let started = false
  t.after(() => {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  })
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '--no-instructions'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-o', `-k ${dir} -p ${port}`, '-l', join(dir, 'postgres.log'), 'start'])
    started = true
    query(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);`)
    const migration = readFileSync(join(ROOT, 'supabase/migrations/202609230001_initial.sql'), 'utf8')
    const file = join(dir, 'migration.sql')
    writeFileSync(file, migration)
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', file])
    query(`insert into auth.users values
      ('${USER}', 'yes@example.com', now()),
      ('${OTHER}', 'other@example.com', now()),
      ('${DENIED}', 'no@example.com', now());
      insert into public.allowed_emails(email) values ('yes@example.com'), ('other@example.com');`)

    const start = (user: string, url: string, mode = 'summary', summaryReserve = 50, audioReserve = 100) =>
      `select public.begin_generation('${user}', '${url}', '${mode}', ${summaryReserve}, ${audioReserve})::text`
    const parse = (sql: string) => JSON.parse(query(sql))
    const finishSummary = (job: string, overview = '요지') =>
      `select public.complete_summary('${job}', '제목', '${overview}', '["내용"]'::jsonb, 3, 100)::text`

    assert.equal(parse(start(DENIED, 'https://example.com/denied')).state, 'not_invited')
    assert.throws(() => query(`set role authenticated; ${start(USER, 'https://example.com/direct')}`))
    const first = parse(start(USER, 'https://example.com/a'))
    assert.equal(first.state, 'started')
    assert.equal(parse(start(OTHER, 'https://example.com/a')).state, 'pending')
    parse(finishSummary(first.job_id))
    assert.equal(parse(start(OTHER, 'https://example.com/a')).state, 'cached')
    assert.equal(Number(query(`select count(*) from public.generation_jobs where user_id='${OTHER}'`)), 0)

    const bundle = parse(start(USER, 'https://example.com/b', 'both'))
    assert.equal(bundle.phase, 'summary')
    assert.equal(parse(finishSummary(bundle.job_id)).phase, 'audio')
    // Audio failure leaves the summary and consumes only the successful summary's one daily use.
    query(`select public.fail_generation('${bundle.job_id}', 8, false)`)
    assert.equal(parse(start(OTHER, 'https://example.com/b')).state, 'cached')
    const retry = parse(start(OTHER, 'https://example.com/b', 'both'))
    assert.equal(retry.phase, 'audio')
    query(`select public.complete_audio('${retry.job_id}', 'audio/b.mp3', 7)`)
    assert.equal(parse(start(USER, 'https://example.com/b', 'both')).state, 'cached')
    assert.equal(Number(query(`select count(*) from public.generation_jobs where user_id='${USER}' and charged`)), 2)
    assert.equal(Number(query(`select count(*) from public.generation_jobs where user_id='${OTHER}' and charged`)), 1)

    const bundleUser = '55555555-5555-4555-8555-555555555555'
    query(`insert into auth.users values ('${bundleUser}', 'bundle@example.com', now());
      insert into public.allowed_emails values ('bundle@example.com', now())`)
    const allSuccess = parse(start(bundleUser, 'https://example.com/full', 'both'))
    parse(finishSummary(allSuccess.job_id))
    query(`select public.complete_audio('${allSuccess.job_id}', 'audio/full.mp3', 7)`)
    assert.equal(Number(query(`select count(*) from public.generation_jobs where user_id='${bundleUser}' and charged`)), 1)

    const failed = parse(start(USER, 'https://example.com/fail'))
    query(`select public.fail_generation('${failed.job_id}', 9, false)`)
    assert.equal(Number(query(`select spent_krw from public.generation_jobs where id='${failed.job_id}'`)), 9)
    assert.equal(Number(query(`select count(*) from public.generation_jobs where user_id='${USER}' and charged`)), 2)
    const quotaFailure = parse(start(OTHER, 'https://example.com/quota'))
    query(`select public.fail_generation('${quotaFailure.job_id}', 0, true)`)
    assert.equal(parse(start(OTHER, 'https://example.com/new-after-quota')).state, 'scrape_paused')
    assert.equal(parse(start(OTHER, 'https://example.com/a')).state, 'cached')
    query('update public.app_state set firecrawl_paused = false')
    for (let index = 0; index < 3; index++) {
      const job = parse(start(USER, `https://example.com/limit-${index}`))
      parse(finishSummary(job.job_id))
    }
    assert.equal(parse(start(USER, 'https://example.com/limit-exceeded')).state, 'daily_limit')
    assert.equal(parse(start(USER, 'https://example.com/a')).state, 'cached')

    // Six independent requests compete for the remaining daily quota of a fresh user.
    const newUser = '44444444-4444-4444-8444-444444444444'
    query(`insert into auth.users values ('${newUser}', 'parallel@example.com', now());
      insert into public.allowed_emails values ('parallel@example.com', now())`)
    const daily = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      queryAsync(start(newUser, `https://example.com/parallel-${i}`)).then(JSON.parse)))
    assert.equal(daily.filter(result => result.state === 'started').length, 5)
    assert.equal(daily.filter(result => result.state === 'daily_limit').length, 1)
    const same = await Promise.all([0, 1].map(() => queryAsync(start(OTHER, 'https://example.com/same')).then(JSON.parse)))
    assert.deepEqual(same.map(result => result.state).sort(), ['pending', 'started'])

    // Include outstanding reservations in the global monthly sum.
    query(`update public.generation_jobs set spent_krw = 0, reserved_krw = 0, status = 'done';
      update public.generation_jobs set spent_krw = 23920 where id = '${first.job_id}'`)
    const budget = await Promise.all([0, 1].map(i =>
      queryAsync(start(OTHER, `https://example.com/budget-${i}`, 'summary', 50, 0)).then(JSON.parse)))
    assert.deepEqual(budget.map(result => result.state).sort(), ['monthly_limit', 'started'])
    assert.equal(parse(start(OTHER, 'https://example.com/a')).state, 'cached')
  } catch (error) { throw error }
})
