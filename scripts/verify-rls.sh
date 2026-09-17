#!/usr/bin/env bash
# Applies every migration to a throwaway database and checks that row level
# security lets the right people through and stops everyone else.
#
#   ./scripts/verify-rls.sh
#
# Needs a local PostgreSQL 15+ reachable as the postgres superuser.
set -euo pipefail

DB_NAME="${DB_NAME:-yfb_rls_check}"
PSQL_USER="${PSQL_USER:-postgres}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_sql_file() {
  su "$PSQL_USER" -c "psql -v ON_ERROR_STOP=1 -q -d $DB_NAME -f $1"
}

echo "→ Tạo database tạm: $DB_NAME"
su "$PSQL_USER" -c "dropdb --if-exists $DB_NAME"
su "$PSQL_USER" -c "createdb $DB_NAME"

echo "→ Tạo các đối tượng Supabase có sẵn (chỉ dùng cho môi trường test)"
run_sql_file "$ROOT_DIR/scripts/local-supabase-shim.sql"

echo "→ Áp dụng migration ($(ls "$ROOT_DIR"/supabase/migrations/*.sql | wc -l) files)"
for migration in "$ROOT_DIR"/supabase/migrations/*.sql; do
  run_sql_file "$migration"
done

echo "→ Kiểm tra phân quyền theo vai trò"
run_sql_file "$ROOT_DIR/scripts/verify-rls.sql"

echo "→ Dọn dẹp"
su "$PSQL_USER" -c "dropdb $DB_NAME"

echo "Phân quyền hoạt động đúng với mọi vai trò đã kiểm tra."
