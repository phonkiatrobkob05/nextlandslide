cat > scripts/export.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
APP_NAME="${APP_NAME:-my-next}"
TAG="${TAG:-latest}"
IMAGE="${IMAGE:-${APP_NAME}:${TAG}}"
OUT="${OUT:-${APP_NAME}-${TAG}.tar}"

docker image inspect "${IMAGE}" >/dev/null 2>&1 || {
  echo "Image not found: ${IMAGE}. Build first."; exit 1;
}
echo "Saving ${IMAGE} -> ${OUT}"
docker save -o "${OUT}" "${IMAGE}"
echo "Created: ${OUT}"
SH
chmod +x scripts/export.sh
