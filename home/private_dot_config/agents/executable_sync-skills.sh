#!/usr/bin/env bash
# Reconcile the shared skills in this directory with each agent's global skill directory.
# Run after adding, removing, or renaming a skill. Edits to existing skills need no
# re-run because the agent directories contain links to the source.
set -euo pipefail
shopt -s nullglob

usage() {
  printf 'Usage: %s [--dry-run]\n' "${0##*/}"
}

DRY_RUN=0
case "${1:-}" in
  '') ;;
  --dry-run) DRY_RUN=1 ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SRC="$SCRIPT_DIR/skills"
TARGETS=("$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.cursor/skills" "$HOME/.pi/agent/skills")

if [[ ! -d "$SRC" ]]; then
  printf 'error: shared skills directory does not exist: %s\n' "$SRC" >&2
  exit 1
fi

run_mkdir() {
  local dir=$1
  if (( DRY_RUN )); then
    printf 'mkdir   %s\n' "$dir"
  else
    mkdir -p "$dir"
  fi
}

run_link() {
  local source=$1
  local destination=$2
  if (( DRY_RUN )); then
    printf 'link    %s -> %s\n' "$destination" "$source"
  else
    ln -sfn "$source" "$destination"
    printf 'linked  %s\n' "$destination"
  fi
}

run_unlink() {
  local link=$1
  if (( DRY_RUN )); then
    printf 'prune   %s\n' "$link"
  else
    rm "$link"
    printf 'pruned  %s\n' "$link"
  fi
}

skill_dirs=("$SRC"/*/)
for t in "${TARGETS[@]}"; do
  [[ -d "$t" ]] || run_mkdir "$t"

  # Remove dangling links that point into SRC (deleted or renamed skills).
  if [[ -d "$t" ]]; then
    for l in "$t"/*; do
      [[ -L "$l" && ! -e "$l" ]] || continue
      link_target=$(readlink "$l")
      [[ "$link_target" == "$SRC"/* ]] || continue
      run_unlink "$l"
    done
  fi

  for s in "${skill_dirs[@]}"; do
    s=${s%/}
    [[ -f "$s/SKILL.md" ]] || continue
    dest="$t/$(basename "$s")"

    if [[ -L "$dest" ]]; then
      link_target=$(readlink "$dest")
      if [[ "$link_target" == "$s" ]]; then
        printf 'ok      %s\n' "$dest"
      elif [[ "$link_target" == "$SRC"/* ]]; then
        # Replace only links owned by this synchronizer. Never overwrite an
        # unrelated link that an agent or another tool may manage.
        run_link "$s" "$dest"
      else
        printf 'SKIP    %s points outside the shared skills directory\n' "$dest"
      fi
    elif [[ -e "$dest" ]]; then
      printf 'SKIP    %s exists and is not a link\n' "$dest"
    else
      run_link "$s" "$dest"
    fi
  done
done

# Link the shared instructions into each agent's global instructions file.
INSTRUCTIONS="$SCRIPT_DIR/AGENTS.md"
INSTRUCTION_TARGETS=("$HOME/.claude/CLAUDE.md" "$HOME/.codex/AGENTS.md" "$HOME/.cursor/AGENTS.md" "$HOME/.pi/agent/AGENTS.md")
for dest in "${INSTRUCTION_TARGETS[@]}"; do
  if [[ -L "$dest" && "$(readlink "$dest")" == "$INSTRUCTIONS" ]]; then
    printf 'ok      %s\n' "$dest"
  elif [[ -L "$dest" || ! -e "$dest" ]]; then
    run_link "$INSTRUCTIONS" "$dest"
  else
    printf 'SKIP    %s exists and is not a link; merge it into %s and delete it\n' "$dest" "$INSTRUCTIONS"
  fi
done
