# Agent Note: Portable hook jobs

Status: implemented

English | [中文](2026-09-17-portable-hook-jobs.zh.md)

## Problem

Every lefthook job executes on the contributor's host, and on Windows lefthook wraps each command in Git's `sh.exe`. That shell honors a script's `#!/usr/bin/env bash` line by asking `env` to resolve `bash` through `PATH`. A host whose `PATH` carries only `Git\cmd` — the directory the Git for Windows installer adds — has no `bash`, which lives in `Git\bin` and `Git\usr\bin`, so `env` answers `/usr/bin/env: 'bash': No such file or directory` with exit status 127. The pre-commit vendor manifest guard was such a script and declared no `glob`, so it ran on every commit and rejected commits that staged no vendored file at all.

## Decision

Hook jobs run commands the contributor host already provides: `git` itself, or a repository TypeScript module through `node_modules/.bin/tsx`. The vendor manifest guard is [scripts/check-vendor-manifest.ts](../../../../scripts/check-vendor-manifest.ts), invoked by [lefthook.yml](../../../../lefthook.yml) as `node_modules/.bin/tsx scripts/check-vendor-manifest.ts`; it keeps the shell script's rule and failure text, where a staged `vendor/<dir>/src` file or vendored `bin.js` requires a staged `vendor/README.md`. [scripts/check-vendor-manifest.spec.ts](../../../../scripts/check-vendor-manifest.spec.ts) pins the path classification, the report text, and the staged-index read, and [scripts/ci-workflow.spec.ts](../../../../scripts/ci-workflow.spec.ts) rejects any hook job whose command names a `.sh` file.

The job set itself is unchanged from [Fast local Git hooks](../../archived/process/2026-07-22-fast-local-git-hooks.md); this decision constrains how each job's command is expressed.

Shell gates stay shell where only CI invokes them on Linux runners, either through the script's shebang ([scripts/check-expected-filenames.sh](../../../../scripts/check-expected-filenames.sh)) or through an explicit `bash` ([scripts/prepare-ci-bubblewrap.sh](../../../../scripts/prepare-ci-bubblewrap.sh), [scripts/wine-windows-gates.sh](../../../../scripts/wine-windows-gates.sh)).

## Alternatives considered

**Require `bash` on every contributor's `PATH`.** The guard keeps its implementation and the repository changes nothing, but a host with Git reachable only through `Git\cmd` fails every commit with a bare `exit status 127`, and the remedy lives outside the repository. Rejected: a repository gate does not depend on an optional host `PATH` entry.

**Keep the shell script and change its shebang to `#!/bin/sh`.** An absolute interpreter path removes the `PATH` lookup, but the guard's rule would then rest on the host's shell resolution instead of the test lane. Rejected in favor of the repository's TypeScript toolchain.

**Invoke the script as `bash scripts/check-vendor-manifest.sh` from lefthook.** This keeps the shell implementation but resolves `bash` through `PATH` exactly as the shebang did. Rejected: it reproduces the failure.

**Drop the guard from the hook and leave the check to CI.** No CI workflow runs the vendored-manifest pairing, so removing the job removes the check rather than relocating it. Rejected.

## Consequences

Commits succeed on hosts whose `PATH` resolves only Git's `cmd` directory, and the guard's rule is pinned by the test lane rather than by lefthook alone. The guard pays one `tsx` process start, the cost the staged lint and third-party-notice jobs already pay, and a hook job's home is a TypeScript module under `scripts/`. The guard exists only as `scripts/check-vendor-manifest.ts`.
