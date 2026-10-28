# dotfiles

Shell, editor, terminal, agent, and macOS settings for my Macs. The `dot` script links the public files into the home directory. Work-only files are in one age-encrypted bundle, and only the work Mac has the key.

## Set up a Mac

1. Install Homebrew, then run `brew install age`.
2. On a work Mac, copy the age key to `~/.config/age/dotfiles.txt`. The key is not in this repository. `dot` treats a Mac with this key as a work Mac.
3. Clone and apply:

   ```sh
   git clone git@github.com:avnukala/dotfiles.git ~/dotfiles
   ~/dotfiles/dot apply
   ```

`dot apply` does these steps, and each step is safe to run again:

1. Link each public file in `files.txt` from `~/<path>` to `home/<path>`. If a live file differs from the repository, `dot` skips it and says so.
2. On a work Mac, unpack the work bundle into the home directory. Existing files stay as they are.
3. Write the pi and Claude Code `settings.json` files.
4. Link the shared skills into each agent with `~/.config/agents/sync-skills.sh`.
5. Register the launchd jobs with `~/.config/launchd/sched apply`.
6. Run `brew bundle` for `Brewfile`, and for `~/.Brewfile.work` on a work Mac.
7. Write the macOS settings, and import the Rectangle settings if they changed.

## Public files and work files

| List | Files | Storage |
|------|-------|---------|
| `files.txt` | Public files | As is in `home/`, linked into the home directory |
| `~/.config/dotfiles-work/files.txt` | Work files | Encrypted in `work/bundle.tar.age` |

The work list is in the bundle, so the names of the work files are not public.

The pi and Claude Code apps rewrite their `settings.json` files and add keys for each Mac, such as hooks and device IDs. So `dot` writes these files instead of linking them. It keeps the keys of the live file and sets the keys in `settings/pi.json` and `settings/claude.json`. On a work Mac, it also merges `~/.config/dotfiles-work/pi-settings.json` and `~/.config/dotfiles-work/claude-settings.json`.

## Daily use

| Task | Command |
|------|---------|
| Apply the repository to this Mac | `dot apply` |
| Start to track a new public file | `dot add <path>` |
| Keep a live file that `dot link` skipped | `dot add <path>` |
| Save a change to a work file | `dot pack` |
| Save a change to Rectangle | `dot prefs` |
| Get changes from the other Mac | `git pull`, then `dot apply` |

A public file is a link into this repository, so an edit to the live file is an edit in the repository. Read `git diff` before each commit. If an app or an agent writes work text into a public file, move that text to a work file first.

To track a new work file, add its path to `~/.config/dotfiles-work/files.txt` and run `dot pack`.

## Keep the key safe

If you lose the age key, nobody can decrypt the bundle. Keep a copy in a password manager that the personal Mac cannot read.
