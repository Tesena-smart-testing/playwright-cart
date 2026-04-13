import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const runStatusEnum = pgEnum('run_status', [
  'running',
  'passed',
  'failed',
  'interrupted',
  'timedOut',
])

export const testStatusEnum = pgEnum('test_status', [
  'passed',
  'failed',
  'timedOut',
  'skipped',
  'interrupted',
])

export const userRoleEnum = pgEnum('user_role', ['admin', 'user'])

export const userThemeEnum = pgEnum('user_theme', ['dark', 'light', 'system'])

export const runs = pgTable(
  'runs',
  {
    runId: text('run_id').primaryKey(),
    project: text('project').notNull(),
    branch: text('branch'),
    commitSha: text('commit_sha'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: runStatusEnum('status').notNull().default('running'),
    reportUrl: text('report_url'),
  },
  (t) => [index('runs_started_at_idx').on(t.startedAt)],
)

export const tests = pgTable(
  'tests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    testId: text('test_id').notNull(),
    runId: text('run_id')
      .notNull()
      .references(() => runs.runId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    titlePath: text('title_path').array().notNull(),
    locationFile: text('location_file').notNull(),
    locationLine: integer('location_line').notNull(),
    locationCol: integer('location_col').notNull(),
    status: testStatusEnum('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
    retry: integer('retry').notNull().default(0),
  },
  (t) => [
    uniqueIndex('tests_run_test_uniq').on(t.runId, t.testId),
    index('tests_run_id_idx').on(t.runId),
  ],
)

export const testErrors = pgTable('test_errors', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  testPk: bigint('test_pk', { mode: 'number' })
    .notNull()
    .references(() => tests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  message: text('message').notNull(),
  stack: text('stack'),
})

export const testAnnotations = pgTable('test_annotations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  testPk: bigint('test_pk', { mode: 'number' })
    .notNull()
    .references(() => tests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  type: text('type').notNull(),
  description: text('description'),
})

export const testAttachments = pgTable('test_attachments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  testPk: bigint('test_pk', { mode: 'number' })
    .notNull()
    .references(() => tests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  filename: text('filename'),
})

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  theme: userThemeEnum('theme').notNull().default('system'),
  runsPerPage: smallint('runs_per_page').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const apiKeys = pgTable(
  'api_keys',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    keyHash: text('key_hash').notNull(),
    label: text('label').notNull(),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('api_keys_key_hash_uniq').on(t.keyHash)],
)

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const revokedTokens = pgTable('revoked_tokens', {
  jti: text('jti').primaryKey(),
  exp: timestamp('exp', { withTimezone: true }).notNull(),
})
