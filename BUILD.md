# TRAE Skill Manager - 手动编译指南

## 项目概述

TRAE Skill Manager 是一个基于 Tauri v2 的桌面应用，用于搜索、浏览和一键安装 Agent Skill 到 TRAE IDE/Work。

## 前置要求

1. **Node.js** (v18+)
2. **pnpm** (v8+)
3. **Rust** (已通过 rustup 安装 GNU 工具链)

## 项目结构

```
trae-skill-manager/
├── src/                    # React 前端代码
│   ├── components/         # UI 组件
│   ├── store/             # Zustand 状态管理
│   ├── types/             # TypeScript 类型定义
│   ├── styles/            # CSS 样式
│   ├── App.tsx            # 主应用组件
│   └── main.tsx           # 入口文件
├── src-tauri/             # Rust 后端代码
│   ├── src/
│   │   ├── main.rs        # Tauri 主入口
│   │   ├── models.rs      # 数据模型
│   │   ├── lib.rs         # 库入口
│   │   └── commands/      # IPC 命令
│   │       ├── scan.rs    # 本地 Skill 扫描
│   │       ├── fetch.rs   # 远程 Skill 获取
│   │       ├── install.rs # Skill 安装
│   │       ├── remove.rs  # Skill 卸载
│   │       └── mod.rs     # 模块导出
│   ├── Cargo.toml         # Rust 依赖配置
│   ├── tauri.conf.json    # Tauri 配置
│   └── build.rs           # 构建脚本
├── package.json           # Node.js 依赖
├── vite.config.ts         # Vite 配置
├── tailwind.config.js     # Tailwind CSS 配置
└── tsconfig.json          # TypeScript 配置
```

## 编译步骤

### 步骤 1: 进入项目目录

```powershell
cd d:\WorkingSpace\trae-skill-manager
```

### 步骤 2: 安装前端依赖

```powershell
pnpm install
```

### 步骤 3: 配置 Rust 使用 GNU 工具链

```powershell
# 设置环境变量
$env:CARGO_HOME = 'C:\cargo'
$env:RUSTUP_HOME = 'C:\rustup'
$env:PATH = 'C:\rustup\toolchains\stable-x86_64-pc-windows-gnu\bin;C:\cargo\bin;' + $env:PATH

# 确认工具链
rustup run stable-x86_64-pc-windows-gnu rustc --version
```

### 步骤 4: 编译并运行开发版本

```powershell
# 使用 Tauri CLI 启动开发模式
pnpm tauri dev
```

这会同时启动：
- Vite 前端开发服务器 (http://localhost:1420)
- Tauri 桌面应用窗口

### 步骤 5: 构建发布版本

```powershell
# 构建前端
pnpm build

# 构建 Tauri 应用
pnpm tauri build
```

构建完成后，安装包位于：
`src-tauri/target/release/bundle/`

## 环境变量说明

由于当前环境的 MSVC 链接器有权限问题，我们使用 GNU 工具链：

```powershell
# 必须设置的环境变量
$env:CARGO_HOME = 'C:\cargo'
$env:RUSTUP_HOME = 'C:\rustup'
$env:PATH = 'C:\rustup\toolchains\stable-x86_64-pc-windows-gnu\bin;C:\cargo\bin;' + $env:PATH
```

## 功能说明

### 发现页 (Discover)
- 搜索 skills.sh 生态中的 Skill
- 按"全部"和"趋势"筛选
- 查看 Skill 详情和安装命令
- 一键安装到 TRAE

### 已安装页 (Installed)
- 扫描本地 TRAE Skill 目录
- 查看已安装的 Skill 列表
- 打开 Skill 所在文件夹
- 卸载 Skill

### 设置页 (Settings)
- 配置 TRAE 全局 Skill 目录路径
- 配置项目路径（用于扫描项目级 Skill）
- 切换深色/浅色主题

## 技术栈

- **框架**: Tauri v2 (Rust + WebView2)
- **前端**: React 18 + TypeScript 5
- **样式**: Tailwind CSS 3
- **状态管理**: Zustand
- **图标**: Lucide React
- **HTTP 客户端**: reqwest (Rust)
- **HTML 解析**: scraper (Rust)

## 配色方案

基于 TRAE 品牌图标提取：
- 主背景: `#0a0a0f`
- 侧边栏: `#111118`
- 卡片: `#16161d`
- 强调色: `#00ff88` (荧光绿)
- 文字主色: `#f0f0f5`
- 文字次色: `#6b7280`

## 常见问题

### Q: 编译时提示 "无法打开 Cargo.lock"
A: 确保当前用户对项目目录有完全控制权限。运行：
```powershell
icacls 'd:\WorkingSpace\trae-skill-manager' /grant "$env:USERNAME":F /T
```

### Q: 提示 "npx 不可用"
A: 确保 Node.js 已正确安装，且 npx 在 PATH 中：
```powershell
node --version
npx --version
```

### Q: 前端页面空白
A: 检查 Vite 开发服务器是否正常启动，访问 http://localhost:1420 查看

## 许可证

MIT
