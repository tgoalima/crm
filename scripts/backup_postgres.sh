#!/usr/bin/env bash
# scripts/backup_postgres.sh
#
# Backup diário do Postgres self-hosted (container supabase-db) — sem isso,
# qualquer incidente sério no banco de produção era irrecuperável (nenhum
# backup automatizado existia antes desta versão). Roda via cron na VPS,
# gera um dump comprimido e apaga backups com mais de RETENTION_DAYS dias.
#
# Instalação (uma vez, na VPS):
#   crontab -e
#   0 4 * * * /home/ubuntu/apps/suprimatica-crm/scripts/backup_postgres.sh >> /home/ubuntu/backups/backup.log 2>&1

set -euo pipefail

CONTAINER="supabase-db"
DB_USER="postgres"
DB_NAME="postgres"
BACKUP_DIR="/home/ubuntu/backups/postgres"
RETENTION_DAYS=14
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DEST="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup -> ${DEST}"

docker exec -i "${CONTAINER}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${DEST}"

SIZE=$(du -h "${DEST}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup concluído (${SIZE})"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Removendo backups com mais de ${RETENTION_DAYS} dias..."
find "${BACKUP_DIR}" -name 'backup_*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backups atuais:"
ls -lh "${BACKUP_DIR}"
