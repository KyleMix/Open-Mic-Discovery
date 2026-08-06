#!/usr/bin/env node
/**
 * Generate src/types/database.types.ts from a plain Postgres connection.
 *
 *   node scripts/dev/gen-types.mjs [connection-string]
 *
 * `supabase gen types` shells out to a container even when given --db-url, so
 * it cannot run where Docker is unavailable. This drives the same generator
 * (@supabase/postgres-meta, what the CLI uses underneath) directly against a
 * database, which makes `scripts/db/verify-local.sh` a complete loop: apply
 * migrations, run pgTAP, regenerate types.
 *
 * Defaults to the database verify-local.sh builds. Point it at the Supabase
 * stack (port 54322) when Docker is available; the output is the same.
 *
 * postgres-meta is not a dependency. Install it for the run:
 *   npm install --no-save @supabase/postgres-meta
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgresMeta } from '@supabase/postgres-meta';
import { apply as applyTypescriptTemplate } from '@supabase/postgres-meta/dist/server/templates/typescript.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'types', 'database.types.ts');
const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/openmicexplorer_verify';

const connectionString = process.argv[2] ?? DEFAULT_URL;
const schemas = ['public'];
const pgMeta = new PostgresMeta({ connectionString, max: 1 });

try {
  const [tables, views, materializedViews, columns, relationships, functions, types, allSchemas] =
    await Promise.all([
      pgMeta.tables.list({ includedSchemas: schemas, includeColumns: false }),
      pgMeta.views.list({ includedSchemas: schemas, includeColumns: false }),
      pgMeta.materializedViews.list({ includedSchemas: schemas, includeColumns: false }),
      pgMeta.columns.list({ includedSchemas: schemas }),
      pgMeta.relationships.list(),
      pgMeta.functions.list({ includedSchemas: schemas }),
      pgMeta.types.list({ includeArrayTypes: true, includeSystemSchemas: true }),
      pgMeta.schemas.list(),
    ]);

  const failed = [tables, views, columns, functions, types, allSchemas].find((r) => r.error);
  if (failed) {
    throw new Error(failed.error.message);
  }

  const output = await applyTypescriptTemplate({
    schemas: allSchemas.data.filter((s) => schemas.includes(s.name)),
    tables: tables.data,
    views: views.data,
    materializedViews: materializedViews.data,
    columns: columns.data,
    relationships: relationships.data,
    foreignTables: [],
    // Trigger functions have no callable signature and are not RPCs.
    functions: functions.data.filter((f) => f.return_type !== 'trigger'),
    types: types.data,
    detectOneToOneRelationships: true,
  });

  writeFileSync(OUT, output);
  console.log(`  wrote ${OUT.replace(ROOT + '/', '')} from ${connectionString.split('@').pop()}`);
} finally {
  await pgMeta.end();
}
