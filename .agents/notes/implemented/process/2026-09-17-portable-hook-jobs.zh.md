# Agent Note: 可移植的钩子任务

Status: implemented

[English](2026-09-17-portable-hook-jobs.md) | 中文

## 问题

每个 lefthook 任务都在贡献者的主机上执行，而在 Windows 上，lefthook 会把每条命令包进 Git 的 `sh.exe`。该 shell 遇到脚本的 `#!/usr/bin/env bash` 行时，会让 `env` 通过 `PATH` 解析 `bash`。若某台主机的 `PATH` 只包含 `Git\cmd`（Git for Windows 安装程序添加的目录），就找不到位于 `Git\bin` 与 `Git\usr\bin` 的 `bash`，于是 `env` 以退出状态 127 输出 `/usr/bin/env: 'bash': No such file or directory`。pre-commit 的 vendor manifest（元数据清单）守卫正是这样一个脚本，且没有声明 `glob`，因此它在每次提交时都会运行，并拒绝完全没有暂存 vendor 文件的提交。

## 决策

钩子任务运行贡献者主机本就提供的命令：`git` 本身，或通过 `node_modules/.bin/tsx` 运行仓库中的 TypeScript 模块。vendor manifest 守卫是 [scripts/check-vendor-manifest.ts](../../../../scripts/check-vendor-manifest.ts)，由 [lefthook.yml](../../../../lefthook.yml) 以 `node_modules/.bin/tsx scripts/check-vendor-manifest.ts` 调用；它保留 shell 脚本的规则与失败文本：暂存的 `vendor/<dir>/src` 文件或 vendored `bin.js` 必须同时暂存 `vendor/README.md`。[scripts/check-vendor-manifest.spec.ts](../../../../scripts/check-vendor-manifest.spec.ts) 锁定路径判定、报告文本与暂存索引读取，[scripts/ci-workflow.spec.ts](../../../../scripts/ci-workflow.spec.ts) 拒绝任何命令中出现 `.sh` 文件的钩子任务。

任务集合本身与[快速本地 Git 钩子](../../archived/process/2026-07-22-fast-local-git-hooks.md)一致；本决策约束的是每个任务的命令如何书写。

只有在 CI 于 Linux runner 上调用时，shell 门禁才保留 shell 形式：既可以通过脚本自身的 shebang（[scripts/check-expected-filenames.sh](../../../../scripts/check-expected-filenames.sh)），也可以通过显式 `bash`（[scripts/prepare-ci-bubblewrap.sh](../../../../scripts/prepare-ci-bubblewrap.sh)、[scripts/wine-windows-gates.sh](../../../../scripts/wine-windows-gates.sh)）。

## 考虑过的替代方案

**要求每位贡献者的 `PATH` 中都有 `bash`。** 守卫可以保留原实现，仓库无需改动，但 Git 仅通过 `Git\cmd` 可达的主机会在每次提交时以裸 `exit status 127` 失败，且补救措施在仓库之外。不予采纳：仓库门禁不依赖可选的主机 `PATH` 条目。

**保留 shell 脚本，只把 shebang 改成 `#!/bin/sh`。** 绝对解释器路径消除了 `PATH` 查找，但守卫的规则将依赖主机的 shell 解析，而不是测试 lane。不予采纳，改用仓库的 TypeScript 工具链。

**在 lefthook 中以 `bash scripts/check-vendor-manifest.sh` 调用脚本。** 这保留了 shell 实现，但仍像 shebang 一样通过 `PATH` 解析 `bash`。不予采纳：它会重现同一失败。

**从钩子中移除该守卫，交由 CI 检查。** 没有任何 CI 工作流运行 vendored manifest 配对检查，因此移除该任务等于移除检查，而非迁移检查。不予采纳。

## 结果

在 `PATH` 只解析到 Git `cmd` 目录的主机上，提交可以成功；守卫的规则由测试 lane 锁定，而不再只依赖 lefthook。守卫付出一次 `tsx` 进程启动开销——暂存 lint 与第三方声明任务本已付出同样的开销——钩子任务的归属形态成为 `scripts/` 下的 TypeScript 模块。该守卫只存在于 `scripts/check-vendor-manifest.ts`。
