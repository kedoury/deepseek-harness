import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  renderVendorManifestFailure,
  runVendorManifestGuard,
  vendoredSourcePaths,
  vendorManifestFailure,
} from './check-vendor-manifest.ts'

const fixtureRoots: string[] = []

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-vendor-manifest-'))
  fixtureRoots.push(root)
  git(root, ['init', '-q', '--initial-branch=master'])
  git(root, ['config', 'user.email', 'vendor-manifest@example.com'])
  git(root, ['config', 'user.name', 'Vendor Manifest Tests'])
  write(root, 'README.md', '# Fixture\n')
  git(root, ['add', '--', 'README.md'])
  git(root, ['commit', '-q', '-m', 'initial'])
  return root
}

describe('vendored source detection', () => {
  it('admits vendored source, its nested files, and the vendored bin entry', () => {
    expect(vendoredSourcePaths([
      'vendor/cordis/src/index.ts',
      'vendor/cordis/src/nested/deep.ts',
      'vendor/cordis/bin.js',
      'packages/session/session/src/index.ts',
    ])).toEqual([
      'vendor/cordis/src/index.ts',
      'vendor/cordis/src/nested/deep.ts',
      'vendor/cordis/bin.js',
    ])
  })

  it('excludes vendored metadata, sibling directories, and every near miss', () => {
    expect(vendoredSourcePaths([
      'vendor/README.md',
      'vendor/cordis/package.json',
      'vendor/cordis/lib/index.js',
      'vendor/cordis/tests/src/index.ts',
      'vendor/cordis/srcfoo/index.ts',
      'vendor//src/index.ts',
      'vendors/cordis/src/index.ts',
      'docs/vendor/cordis/src/index.ts',
    ])).toEqual([])
  })

  it('treats the vendored bin entry name as a prefix, including its sidecars', () => {
    expect(vendoredSourcePaths(['vendor/cordis/bin.js.map', 'vendor/cordis/bin.jsx'])).toEqual([
      'vendor/cordis/bin.js.map',
      'vendor/cordis/bin.jsx',
    ])
  })
})

describe('vendor manifest guard', () => {
  it('reports each vendored-source path staged without the manifest', () => {
    expect(vendorManifestFailure([
      'vendor/cordis/src/index.ts',
      'docs/development.md',
      'vendor/schemastery/bin.js',
    ])).toBe([
      'vendor manifest guard: vendored SOURCE changed without updating vendor/README.md:',
      '  vendor/cordis/src/index.ts',
      '  vendor/schemastery/bin.js',
      'Log the modification in vendor/README.md ("Local modifications") and stage it.',
    ].join('\n'))
    expect(renderVendorManifestFailure(['vendor/cordis/src/index.ts'])).toContain('  vendor/cordis/src/index.ts')
  })

  it('accepts a staged manifest or a change touching no vendored source', () => {
    expect(vendorManifestFailure(['vendor/cordis/src/index.ts', 'vendor/README.md'])).toBeUndefined()
    expect(vendorManifestFailure(['vendor/README.md'])).toBeUndefined()
    expect(vendorManifestFailure(['packages/session/session/src/index.ts'])).toBeUndefined()
    expect(vendorManifestFailure([])).toBeUndefined()
  })

  it('reads the staged index and clears the failure once the manifest is staged', () => {
    const root = fixture()
    write(root, 'vendor/cordis/src/index.ts', 'export const vendored = 1\n')
    write(root, 'vendor/README.md', '# Vendor\n')
    git(root, ['add', '--', 'vendor/cordis/src/index.ts', 'vendor/README.md'])
    expect(runVendorManifestGuard(root)).toBeUndefined()

    git(root, ['reset', '-q', '--', 'vendor/README.md'])
    expect(runVendorManifestGuard(root)).toContain('  vendor/cordis/src/index.ts')

    write(root, 'vendor/cordis/src/added.ts', 'export const added = 2\n')
    expect(runVendorManifestGuard(root)).not.toContain('vendor/cordis/src/added.ts')
    git(root, ['add', '--', 'vendor/cordis/src/added.ts'])
    expect(runVendorManifestGuard(root)).toContain('  vendor/cordis/src/added.ts')

    git(root, ['reset', '-q', '--', 'vendor'])
    expect(runVendorManifestGuard(root)).toBeUndefined()
  })
})
