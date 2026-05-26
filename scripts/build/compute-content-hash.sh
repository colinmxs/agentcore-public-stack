#!/usr/bin/env bash
#============================================================
# compute-content-hash.sh — SHA-256 hash of Docker build inputs.
#
# Computes a deterministic hash that uniquely identifies the
# inputs to a `docker build`. The hash is used as the image tag
# so that `build-and-push-if-changed.sh` can skip rebuilds when
# nothing has changed.
#
# Usage:
#   compute-content-hash.sh \
#     --dockerfile backend/Dockerfile.app-api \
#     --source-dir backend/src \
#     --manifest   backend/pyproject.toml \
#     --manifest   backend/uv.lock
#
# Output:
#   The first 16 chars of a SHA-256 hex digest, on stdout.
#   (Long enough to be globally collision-safe in practice;
#   short enough to be readable as an ECR tag.)
#
# Hash algorithm:
#   1. For each --dockerfile and --manifest, compute sha256sum.
#   2. For --source-dir, list every regular file (sorted, excluding
#      VCS/cache cruft), compute sha256sum of each, append.
#   3. Pipe the resulting line stream through sha256sum to get one
#      final 64-char digest. Output the first 16 chars.
#
# Determinism: `find ... | sort` guarantees stable ordering across
# runs and across machines. We hash file contents (not metadata),
# so timestamps / inode numbers don't perturb the result.
#============================================================
set -euo pipefail

DOCKERFILE=""
SOURCE_DIR=""
MANIFESTS=()

usage() {
    cat <<EOF >&2
Usage: $0 --dockerfile PATH --source-dir DIR [--manifest PATH]...

  --dockerfile PATH   The Dockerfile that will be passed to docker build.
  --source-dir  DIR   Source tree whose contents are baked into the image.
  --manifest    PATH  Lockfile / manifest file affecting the build (repeatable).
EOF
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dockerfile) DOCKERFILE="$2"; shift 2 ;;
        --source-dir) SOURCE_DIR="$2"; shift 2 ;;
        --manifest)   MANIFESTS+=("$2"); shift 2 ;;
        -h|--help)    usage ;;
        *)            echo "Unknown arg: $1" >&2; usage ;;
    esac
done

[[ -n "$DOCKERFILE" ]] || { echo "missing --dockerfile" >&2; usage; }
[[ -n "$SOURCE_DIR" ]] || { echo "missing --source-dir" >&2; usage; }
[[ -f "$DOCKERFILE" ]] || { echo "dockerfile not found: $DOCKERFILE" >&2; exit 2; }
[[ -d "$SOURCE_DIR" ]] || { echo "source-dir not found: $SOURCE_DIR" >&2; exit 2; }

# Patterns to exclude from the source tree. These should never affect
# the resulting image (Dockerfiles do their own COPY filtering).
EXCLUDES=(
    -path '*/__pycache__' -prune -o
    -path '*/.git'        -prune -o
    -path '*/node_modules' -prune -o
    -path '*/.venv'       -prune -o
    -path '*/.pytest_cache' -prune -o
    -path '*/.mypy_cache' -prune -o
    -name '*.pyc'         -prune -o
    -name '.DS_Store'     -prune -o
)

{
    # Hash each manifest and the Dockerfile. Each line emitted has
    # the canonical relative path so reordering the args still produces
    # the same final hash (we sort the lines before final hashing).
    sha256sum -- "$DOCKERFILE"
    for m in "${MANIFESTS[@]}"; do
        [[ -f "$m" ]] || { echo "manifest not found: $m" >&2; exit 2; }
        sha256sum -- "$m"
    done

    # Source tree: every regular file under SOURCE_DIR, ignoring excludes.
    # NUL-delimited so paths with spaces survive. Sort so the order is
    # deterministic across machines (locale set explicitly to C).
    LC_ALL=C find "$SOURCE_DIR" "${EXCLUDES[@]}" -type f -print0 \
        | LC_ALL=C sort -z \
        | xargs -0 sha256sum --
} | LC_ALL=C sort | sha256sum | cut -c1-16
