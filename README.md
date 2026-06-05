# @savagelands-net/pi-cwd

Pi extension that changes Pi's **real session working directory** from inside Pi.

Unlike virtual-cwd extensions that rewrite tool arguments while leaving `ctx.cwd` unchanged, this extension forks the current session into a new session whose header has the target cwd, then switches Pi to that session. After the switch, `ctx.cwd` is the new directory.

## Install

```bash
pi install git:github.com/savagelands-net/pi-cwd
```

Then restart Pi or run:

```text
/reload
```

## Usage

```text
/cwd                    # show the current real cwd
/cd                     # alias: show the current real cwd
/cwd /tmp               # absolute path
/cwd ../other-project   # relative to the current real cwd
/cwd ~/repos/project    # tilde expansion
/cd ~/repos/project     # alias
```

Directory arguments support tab completion.

## How it works

`/cwd <dir>` and `/cd <dir>`:

1. resolve the target directory (`absolute`, `relative`, and `~` are supported)
2. verify the target exists and is a directory
3. fork the current session file into the target cwd using Pi's `SessionManager.forkFrom(...)`
4. switch Pi to the newly forked session with `ctx.switchSession(...)`

Because the target cwd is stored in the new session header, the cwd survives:

- `/reload`
- quitting and resuming the session
- built-in tools and extension code that read `ctx.cwd`

## Notes

- This requires a persisted session. Ephemeral `--no-session` sessions cannot be moved because there is no source session file to fork.
- The command creates a new session file each time the cwd changes. The new session records the previous session as `parentSession`.
- `/cwd` with no argument only reports the current real cwd.
