# TRAE Skill Manager

> Search, browse and install Agent Skills —— TRAE 技能管理器（Tauri 桌面应用）。

## 简介

**TRAE Skill Manager** 是一个桌面应用，用于**搜索、浏览和安装 Agent Skills（技能）**。基于 **Tauri** 构建，兼具桌面端的原生性能与 Web 前端的灵活性。

## 技术栈

- **桌面壳**: Tauri（Rust）
- **前端**: Vite（含 `pnpm` workspace 管理）
- **图标**: 通过脚本生成多尺寸图标（`generate-icons.mjs`）

## 快速开始

```bash
pnpm install
pnpm run dev
pnpm run tauri
```

## 构建

```bash
pnpm run build
pnpm run tauri build
```

## 相关文档

- `BUILD.md` — 构建指南
- `INSTALL_OPTIMIZATION_DESIGN.md` — 安装优化设计
- `trae-skill-manager-redesign/` — 设计重构方案