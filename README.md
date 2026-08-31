<div align="center">

<img src="assets/logo.svg" width="96" alt="TRAE Skill Manager logo">

# TRAE Skill Manager

*搜索、浏览并一键安装 Agent Skills 与 MCP Server 的桌面管理器*

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white&style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white&style=flat-square)
![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white&style=flat-square)

[功能特性](#功能特性) • [技术栈](#技术栈) • [快速开始](#快速开始) • [使用指南](#使用指南) • [目录结构](#目录结构) • [界面预览](#界面预览)

</div>

TRAE Skill Manager 是一个基于 **Tauri + React** 的桌面应用，用于**发现、安装和管理 Agent Skills 与 MCP Server**。内置技能市场与 GitHub 社区双通道搜索，安装流程在 Rust 侧事务化执行，并实时回传终端输出。

## 功能特性

- **技能市场发现** — `全部 / 趋势 / 热门 / 收藏` 视图，支持分类、标签、来源过滤与多字段排序（安装量 / Stars / 名称 / 更新时间）
- **双通道搜索** — 内置 `skills.sh` 市场 + GitHub 社区仓库，搜索结果直接展示仓库简介与安装量
- **GitHub 技能聚合** — 内置 14 个社区技能仓库（含 `emilkowalski/skills` 等），多源并行抓取 + 版本化缓存 + 过期兜底，技能总量 2000+，无重复
- **事务化安装** — 依次尝试 `git clone → npx degit → npx skills add`，`temp → 验证 → move`，失败自动降级，全程流式输出
- **实时终端体验** — Rust 侧 `emit` 安装事件，前端 `TerminalViewer` 逐行展示 stdio 输出
- **已装技能管理** — 扫描、移除、启用 / 停用、升级与回滚
- **MCP Server 市场** — 内置分类（dev-tools / database / browser / search 等），配置对话框 + 详情面板
- **技能详情面板** — 概览 / 文档 / 文件 / 相关四个标签页，支持 README 与 SKILL.md 在线预览
- **安装历史与项目切换** — 记录每次安装操作，支持多项目路径与自定义安装位置
- **技能描述翻译** — 一键将技能描述翻译为中文，带本地缓存
- **自绘标题栏** — 无边框窗口，内置边栏折叠、帮助菜单（更新日志 / 开发者工具 / 报告问题等 9 项）与窗口控制按钮
- **自定义右键菜单** — 替换系统菜单，支持刷新 / 复制 / 粘贴 / 全选 / 设置 / 退出，自动钳制在视口内
- **可折叠边栏** — 一键收缩为图标模式，释放更多内容空间

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 · TypeScript · Vite 5 |
| 状态管理 | Zustand（skillStore / mcpStore） |
| 动画 | motion |
| 样式 | Tailwind CSS |
| 桌面后端 | Tauri 2（Rust），命令拆分至 `commands/*` |
| 构建 | pnpm workspace · sharp 生成多尺寸图标 |

## 快速开始

> [!NOTE]
> 需要 [Node.js](https://nodejs.org) 18+ 与 [pnpm](https://pnpm.io) 11+。桌面调试还需要 [Rust](https://www.rust-lang.org) 工具链与系统 WebView 依赖。

```bash
# 安装依赖
pnpm install

# 纯前端开发（Vite）
pnpm run dev

# 桌面应用调试（Tauri）
pnpm run tauri dev

# 打包桌面安装包
pnpm run tauri build
```

## 使用指南

### 发现与安装技能

1. 打开 **发现** 页，在顶部切换「官方」或「GitHub 社区」搜索通道
2. 使用搜索框、分类、热门标签或排序下拉框筛选技能
3. 点击卡片查看详情（概览 / 文档 / 文件 / 相关），或直接点击「安装」
4. 安装过程在右侧终端面板实时展示，完成后按钮变为「已安装」

### 批量操作

勾选多张卡片后，底部会弹出批量操作栏，可一次性安装多个技能。

### 管理已装技能

在 **已安装** 页可扫描本地技能目录，支持启用 / 停用、移除、升级与回滚。

### 自定义安装

侧边栏底部「自定义安装」支持从任意 Git 仓库或本地路径安装技能，`skill_path_hint` 可递归定位技能目录。

## 目录结构

```
trae-skill-manager/
├── src/                      # 前端
│   ├── components/           # Discover / Installed / History / Mcp / Settings / DetailPanel / TerminalViewer
│   ├── store/                # skillStore.ts · mcpStore.ts
│   ├── lib/                  # mcpMarketplace.ts · useVirtualList.ts · motionConfig.ts
│   ├── styles/               # globals.css
│   └── types/                # 共享类型定义
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── commands/         # install / scan / remove / toggle / update / translate / search_github / fetch / history ...
│   │   ├── models.rs         # 数据模型
│   │   ├── main.rs           # 入口与命令注册
│   │   └── utils/path.rs     # 技能目录探测
│   └── tauri.conf.json       # Tauri 配置
├── assets/                   # 图标与截图
├── BUILD.md                  # 构建指南
└── INSTALL_OPTIMIZATION_DESIGN.md  # 安装优化设计
```

## 界面预览

<img src="assets/screenshot-discover.png" alt="发现页：技能卡片网格、分类过滤、排序与搜索" width="100%" />

*发现页：技能卡片网格、分类过滤、排序与搜索。*

<div align="center">
  <img src="assets/screenshot-mcp.png" alt="MCP 管理中心" width="49%" />
  <img src="assets/screenshot-settings.png" alt="设置页" width="49%" />
</div>

*MCP 管理中心与设置页。*

## 文档

- [`BUILD.md`](BUILD.md) — 构建与打包指南
- [`INSTALL_OPTIMIZATION_DESIGN.md`](INSTALL_OPTIMIZATION_DESIGN.md) — 安装流程优化设计

---

<div align="center">Made by jimmma</div>
