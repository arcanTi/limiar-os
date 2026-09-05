#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: deploy.sh <ghcr-image@sha256:digest> <deploy-root> <release-id>" >&2
  exit 2
fi

image_ref=$1
deploy_root=$2
release_id=$3

[[ "$image_ref" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || {
  echo "refusing mutable or invalid image reference: $image_ref" >&2
  exit 2
}
[[ "$deploy_root" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "deploy root must be an absolute path containing safe characters" >&2
  exit 2
}
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]] || {
  echo "release id must be a full Git commit SHA" >&2
  exit 2
}

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_compose="$script_dir/compose.yaml"
env_file="$deploy_root/shared/.env"
release_dir="$deploy_root/releases/$release_id"
backup_dir="$deploy_root/backups"
current_image_file="$deploy_root/current-image"

for command_name in docker flock curl; do
  command -v "$command_name" >/dev/null || {
    echo "required command is missing: $command_name" >&2
    exit 1
  }
done
docker compose version >/dev/null
[[ -r "$source_compose" ]] || { echo "missing compose manifest: $source_compose" >&2; exit 1; }
[[ -r "$env_file" ]] || { echo "missing production environment: $env_file" >&2; exit 1; }

mkdir -p "$deploy_root" "$release_dir" "$backup_dir"
exec 9>"$deploy_root/deploy.lock"
flock -n 9 || { echo "another deployment is already running" >&2; exit 1; }

install -m 0644 "$source_compose" "$release_dir/compose.yaml"
export LIMIAR_IMAGE="$image_ref"
compose=(
  docker compose
  --project-directory "$release_dir"
  --env-file "$env_file"
  --file "$release_dir/compose.yaml"
)

previous_image=""
if [[ -r "$current_image_file" ]]; then
  previous_image=$(<"$current_image_file")
fi

echo "pulling immutable image $image_ref"
docker pull "$image_ref"

echo "starting PostgreSQL"
"${compose[@]}" up --detach postgres
for attempt in $(seq 1 30); do
  if "${compose[@]}" exec -T postgres pg_isready -U limiar -d limiar >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    "${compose[@]}" logs postgres
    echo "PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 2
done

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_tmp="$backup_dir/.postgres-${timestamp}-before-${release_id}.dump.tmp"
backup_file="$backup_dir/postgres-${timestamp}-before-${release_id}.dump"
echo "creating pre-migration PostgreSQL backup"
"${compose[@]}" exec -T postgres \
  pg_dump --username limiar --dbname limiar --format=custom > "$backup_tmp"
test -s "$backup_tmp"
mv "$backup_tmp" "$backup_file"

echo "running schema migration and idempotent bootstrap"
"${compose[@]}" run --rm --no-deps app \
  python -c 'from backend.db import init_db; init_db()'

echo "starting application"
"${compose[@]}" up --detach --no-build app
app_healthy=false
for attempt in $(seq 1 30); do
  app_container=$("${compose[@]}" ps -q app)
  health_status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$app_container" 2>/dev/null || true)
  if [[ "$health_status" == "healthy" ]]; then
    app_healthy=true
    break
  fi
  sleep 3
done

if [[ "$app_healthy" != true ]]; then
  "${compose[@]}" logs app
  if [[ "$previous_image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]]; then
    echo "application health failed; restoring previous image $previous_image" >&2
    export LIMIAR_IMAGE="$previous_image"
    docker pull "$previous_image"
    "${compose[@]}" up --detach --no-build app
  fi
  echo "deployment failed; database backup retained at $backup_file" >&2
  exit 1
fi

published_endpoint=$("${compose[@]}" port app 8765)
curl --fail --silent --show-error "http://${published_endpoint}/api/health" >/dev/null
printf '%s\n' "$image_ref" > "$deploy_root/.current-image.tmp"
mv "$deploy_root/.current-image.tmp" "$current_image_file"
ln -sfn "$release_dir" "$deploy_root/.current.next"
mv -Tf "$deploy_root/.current.next" "$deploy_root/current"

# Deployment backups are a fast rollback aid, not the long-term backup policy.
find "$backup_dir" -type f -name 'postgres-*.dump' -mtime +30 -delete
echo "deployment successful: $release_id"
echo "image: $image_ref"
echo "backup: $backup_file"
