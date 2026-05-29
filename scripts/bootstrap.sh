#!/usr/bin/env bash

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/mokbhai/monorepo-astro-nestjs.git}"
BOOTSTRAP_REF="${BOOTSTRAP_REF:-main}"
BOOTSTRAP_USE_TTY="${BOOTSTRAP_USE_TTY:-1}"

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

prompt_target_dir() {
  local tty_path="/dev/tty"

  if [[ ! -r "$tty_path" || ! -w "$tty_path" ]]; then
    echo "Target directory is required when no interactive TTY is available." >&2
    exit 1
  fi

  printf "Target directory: " >"$tty_path"
  IFS= read -r target_dir <"$tty_path"
  printf "%s" "$target_dir"
}

ensure_empty_target() {
  local target_dir="$1"

  if [[ -e "$target_dir" && -n "$(ls -A "$target_dir" 2>/dev/null)" ]]; then
    echo "Target directory already exists and is not empty: $target_dir" >&2
    exit 1
  fi
}

main() {
  require_command git
  require_command node
  require_command pnpm

  local target_dir="${1:-}"
  if [[ -z "$target_dir" ]]; then
    target_dir="$(prompt_target_dir)"
  fi

  if [[ -z "$target_dir" ]]; then
    echo "Target directory is required." >&2
    exit 1
  fi

  ensure_empty_target "$target_dir"

  echo "Cloning starter into $target_dir"
  git clone --branch "$BOOTSTRAP_REF" --single-branch "$REPO_URL" "$target_dir"

  cd "$target_dir"

  if [[ "$BOOTSTRAP_USE_TTY" == "1" && -r /dev/tty && -w /dev/tty ]]; then
    exec node scripts/setup-starter.mjs </dev/tty >/dev/tty 2>/dev/tty
  fi

  exec node scripts/setup-starter.mjs
}

main "$@"
