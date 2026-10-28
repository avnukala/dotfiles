# dotfiles

Shell, editor, terminal, agent, and macOS settings for my Macs. [chezmoi](https://www.chezmoi.io) applies them. Work-only files are in one age-encrypted bundle, and only the work Mac has the key.

## Set up a Mac

1. Install Homebrew, then run `brew install chezmoi age`.
2. On a work Mac, copy the age key to `~/.config/chezmoi/key.txt`. The key is not in this repository.
3. Clone and apply:

   ```sh
   chezmoi init --source ~/dotfiles --apply avnukala/dotfiles
   ```

   chezmoi asks if this is a work Mac and asks for the git email. It keeps the answers in `~/.config/chezmoi/chezmoi.toml`, outside the repository.

On a personal Mac, answer no. chezmoi then skips the bundle and does not need the key.

## What is in the repository

| Path | Content |
|------|---------|
| `home/` | The chezmoi source. A `dot_` name becomes a `.` name in the home directory. |
| `home/.work/` | The encrypted work bundle and the encrypted work parts of shared files. |
| `home/.prefs/` | Rectangle settings, as an XML plist. |
| `home/run_onchange_after_*` | Scripts that unpack the bundle, link the agent skills, register launchd jobs, run `brew bundle`, and write macOS settings. Each script runs again when its inputs change. |
| `scripts/work-pack` | Encrypts the work files into `home/.work/`. |
| `scripts/prefs-capture` | Copies the current Rectangle settings into `home/.prefs/`. |

## How shared files hold work parts

- `~/.zshrc` sources `~/.zshrc.work` if the file exists.
- `~/.gitconfig` takes the email from the chezmoi configuration file.
- The pi and Claude Code `settings.json` files use modify templates. Each template keeps the keys that the Mac writes, such as hooks and device IDs, and sets the shared keys. On a work Mac, it also merges the decrypted work part.
- The global `AGENTS.md` adds one encrypted line on a work Mac.

## Daily use

| Task | Command |
|------|---------|
| Apply the repository to this Mac | `chezmoi apply` |
| Preview the changes | `chezmoi diff` |
| Copy a changed plain file back to the repository | `chezmoi re-add` |
| Edit a template or a modify template | `chezmoi edit <target>` |
| Save a change to a work file | `scripts/work-pack` |
| Save a change to Rectangle | `scripts/prefs-capture` |
| Get changes from the other Mac | `chezmoi update` |

The bundle holds the work file list in `~/.config/dotfiles-work/manifest`. The plain work parts of shared files are in `~/.config/dotfiles-work/fragments/`. To change a work file, edit the file in place, run `scripts/work-pack`, and commit.

## Keep the key safe

If you lose the age key, nobody can decrypt the bundle. Keep a copy in a password manager that the personal Mac cannot read.
