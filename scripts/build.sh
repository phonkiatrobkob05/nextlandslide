cat > scripts/build.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
APP_NAME="${APP_NAME:-my-next}"
TAG="${TAG:-$(date +%Y%m%d-%H%M)}"
PLATFORM="${PLATFORM:-linux/amd64}"  # เปลี่ยนเป็น linux/arm64 หากปลายทางเป็น ARM
IMAGE="${IMAGE:-${APP_NAME}:${TAG}}"

echo "Building ${IMAGE} for ${PLATFORM}"
docker buildx create --use >/dev/null 2>&1 || true
docker buildx build --platform "${PLATFORM}" -t "${IMAGE}" --load .
echo "Done: ${IMAGE}"
SH
chmod +x scripts/build.sh
