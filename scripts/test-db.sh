#!/usr/bin/env bash
# Runs the migration + RLS/RPC tests against a throwaway local Postgres DB.
# Usage: DB=postgres://postgres@localhost/chomushi_test scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-postgres://postgres@localhost/chomushi_test}
psql "$DB" -q -v ON_ERROR_STOP=1 -c 'drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;'
psql "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/stub_supabase.sql -f supabase/migrations/20261121000000_init.sql
psql "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_rpc_test.sql | grep -E 'ok:|PASSED' || true
