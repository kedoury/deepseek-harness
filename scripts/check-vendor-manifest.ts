/**
 * Vendoring discipline, mechanized: any staged change under `vendor/<dir>/src`
 * or a vendored `bin.js` must update `vendor/README.md` in the same commit,
 * because that manifest's "Local modifications" log is the contract (see
 * vendor/README.md). The pre-commit hook runs this module through `tsx`, so the
 * guard needs no POSIX shell on the host that commits.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const MAX_GIT_OUTPUT = 64 * 1024 * 1024
const VENDORED_SOURCE_PATTERN = /^vendor\/[^/]+\/(?:src\/|bin\.js)/
const VENDOR_MANIFEST_PATH = 'vendor/README.md'

/**
 * Staged paths that change vendored source and therefore require a manifest update.
 * @param paths - repository-relative staged paths.
 * @returns the vendored-source paths among them, in the given order.
 */
export function vendoredSourcePaths(paths: readonly string[]): string[] {
  return paths.filter(path => VENDORED_SOURCE_PATTERN.test(path))
}

/**
 * Render the guard's failure report.
 * @param vendoredPaths - staged vendored-source paths from {@link vendoredSourcePaths}.
 * @returns the complete report without a trailing newline.
 */
export function renderVendorManifestFailure(vendoredPaths: readonly string[]): string {
  return [
    'vendor manifest guard: vendored SOURCE changed without updating vendor/README.md:',
    ...vendoredPaths.map(path => `  ${path}`),
    'Log the modification in vendor/README.md ("Local modifications") and stage it.',
  ].join('\n')
}

/**
 * Report the guard failure for one staged path set.
 * @param paths - repository-relative staged paths.
 * @returns the failure report, or undefined when the manifest is staged alongside every vendored-source change.
 */
export function vendorManifestFailure(paths: readonly string[]): string | undefined {
  if (paths.includes(VENDOR_MANIFEST_PATH)) return undefined
  const vendoredPaths = vendoredSourcePaths(paths)
  return vendoredPaths.length === 0 ? undefined : renderVendorManifestFailure(vendoredPaths)
}

/**
 * Read the staged path set of the worktree containing `cwd`.
 * @param cwd - directory whose containing Git worktree is inspected.
 * @returns repository-relative staged paths, unquoted and without Git's NUL separators.
 */
export function stagedIndexPaths(cwd: string): string[] {
  const result = spawnSync('git', ['-C', cwd, 'diff', '--cached', '--name-only', '-z', '--'], {
    maxBuffer: MAX_GIT_OUTPUT,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    const detail = result.stderr.toString('utf8').trim()
    const reason = detail === '' ? `Git exited with status ${String(result.status)}` : detail
    throw new Error(`cannot list staged paths: ${reason}`)
  }
  return result.stdout.toString('utf8').split('\0').filter(path => path !== '')
}

/**
 * Run the guard against the worktree containing `cwd`.
 * @param cwd - directory whose containing Git worktree is inspected.
 * @returns the failure report, or undefined when the guard passes.
 */
export function runVendorManifestGuard(cwd: string): string | undefined {
  return vendorManifestFailure(stagedIndexPaths(cwd))
}

const entryPath = process.argv[1]
if (entryPath !== undefined && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  try {
    const failure = runVendorManifestGuard(process.cwd())
    if (failure !== undefined) {
      process.stderr.write(`${failure}\n`)
      process.exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`check-vendor-manifest: ${message}\n`)
    process.exitCode = 1
  }
}
