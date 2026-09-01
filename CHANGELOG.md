# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.0] - 2026-09-01

### 新增

#### CLI 与 MCP（Phase 9）
- `skillctl` 命令行工具：search / info / trending / recommend / list / install / remove / update / rollback / enable / disable / tools / doctor / mcp / daemon / pack / config / bootstrap
- 统一输出信封 `{ok, data, error, warnings}` 与退出码 0/1/2，`--json` 结构化输出供 AI Agent 解析
- MCP Server（stdio）：7 个工具（search_skills / get_skill_detail / recommend_skills_for_task / list_installed_skills / install_skill / remove_skill / detect_tools）+ 2 个资源 + 2 个斜杠命令
- 任务推荐算法：原文关键词权重为别名 2 倍，每条推荐带 reason 与 confidence，纯本地无需 LLM
- skill-discovery 自举技能：一键安装到所有工具，形成「管理器 → 给 AI 装技能 → AI 用管理器」闭环
- 安全边界：路径沙箱（拒绝 `../` 穿越）、源白名单（`skillctl config whitelist`）、CLI/MCP 写操作审计（origin 标记 cli / mcp）
- 本地 HTTP 命令网关（local_api）：默认关闭 + Bearer token 认证，仅监听 127.0.0.1

#### 架构
- 抽取 `skills-core` crate：纯逻辑层（无 Tauri 依赖），GUI / CLI / MCP 三端共用
- `skills-cli` crate：skillctl 二进制 + MCP Server

#### 产品化打磨（Phase 10）
- 本地使用统计与趋势图：基于历史记录聚合，操作历史页展示摘要卡片 + 近 14 天趋势 + Top 技能
- 收藏列表导出 / 导入：JSON 文件读写，兼容纯数组与封装格式，跨机器迁移收藏
- 会话恢复增强：重启后还原搜索关键词、分类、标签、来源筛选、排序与视图状态
- 离线本地安装：支持从本地目录直接复制安装技能，无需网络
- 安装冲突检测：同名技能覆盖前明确提示，防止无意识覆盖
- 缓存清理：统一统计与清理 GitHub / 技能 / 翻译缓存，设置页一键清理并显示释放空间
- 崩溃日志采集：Rust panic hook + 前端 ErrorBoundary 落盘，生产问题可追踪
- 发布配置完善：版本号 1.1.0、shortDescription / category / deb 依赖补齐

### 修复
- `skillctl bootstrap --dry-run` 不再实际写入文件
- crates 构建产物 `crates/*/target` 加入 .gitignore

## [1.0.0] - 2026-09-01

首个正式版本，包含完整技能管理、MCP 生态与桌面体验。

### 新增

#### 技能发现与搜索
- 技能市场发现：`全部 / 趋势 / 热门 / 收藏` 视图，分类、标签、来源过滤与多字段排序
- 双通道搜索：内置 `skills.sh` 市场 + GitHub 社区仓库
- GitHub 技能聚合：14 个社区技能仓库多源并行抓取，技能总量 2000+，版本化缓存 + 过期兜底
- Git Trees API 抓取：一次请求获取整棵文件树，本地过滤，显著降低 API 调用
- GitHub 配额预算器：启动时读取限额，按优先级分配，设置页展示剩余配额与重置时间
- 趋势排序：当天零点随机种子保证同日内顺序稳定，基于 installs / pushed_at 的加权评分

#### 安装与管理
- 事务化安装：`git clone → npx degit → npx skills add` 依次尝试，失败自动降级
- 实时终端体验：Rust 侧 `emit` 安装事件，前端逐行展示 stdio 输出
- 已装技能管理：扫描、移除、启用 / 停用、升级与回滚
- 自定义安装：任意 Git 仓库或本地路径，`skill_path_hint` 递归定位技能目录
- 安装历史与项目切换：记录每次安装操作，支持多项目路径
- 跨工具统一安装模式：Tool Adapter 抽象层，技能目录探测逻辑适配器化

#### MCP 生态
- MCP Server 市场：内置分类（dev-tools / database / browser / search 等）
- MCP 配置转译层：一次配置，多工具同步（Claude Code / Codex / Cursor 等），自动备份与冲突检测
- 配置导入导出：JSON / TOML 格式转换，统一内部 MCP 模型

#### 诊断与洞察（Phase 7）
- 技能健康度诊断：Token 成本分析、冲突检测、僵尸技能识别、描述质量评分
- 技能关系图：力导向图展示技能间关联，支持缩放、拖拽与节点详情
- 技能栈 Preset：内置配方 + 导入导出 `.skillpack.json` + 批量安装

#### 桌面体验（Phase 8）
- 自动更新：Tauri updater + 签名校验，应用内检查新版本、一键升级、更新日志展示
- 多语言：简体中文 / English 界面，支持跟随系统
- 主题定制：亮色 / 暗色 / 跟随系统，支持自定义强调色
- 技能描述翻译：AI 翻译（带本地缓存）+ 内置词库「术语对照」降级（本地翻译，无需联网）
- 自绘标题栏：无边框窗口，帮助菜单（更新日志 / 开发者工具 / 报告问题 / 进程浏览器等 9 项）
- 自定义右键菜单：替换系统菜单，自动钳制在视口内
- 可折叠边栏：一键收缩为图标模式
- 运行中的应用检测：sysinfo 进程枚举 + 工作区推断 + 顶部状态条

#### 工程与分发
- GitHub Actions 三端自动构建：Windows（NSIS + MSI）/ macOS（Apple Silicon + Intel，签名公证）/ Linux（deb + AppImage）
- 自动更新签名密钥配置与发布流程文档

### 修复
- 趋势排序：修复同一天内顺序不稳定问题
- Codex 技能目录约定改为 `.agents/skills`，兼容旧路径
- Claude Code MCP 全局配置路径修正为 `~/.claude.json`
- Trae 进程指纹补充 `TRAE SOLO CN`
- Checkbox 支持 `aria-label` 无障碍标签
- 弹窗定位改用 flex 居中，避免动画冲突

### 性能
- 技能源串行改并发（上限 6-8），冷启动耗时显著降低
- reqwest Client 全局单例，HTTP/2 连接复用，减少 TLS 握手
- 缓存改为 stale-while-revalidate 策略，首屏返回旧数据，后台刷新后推送事件
- enrich 降级为后台低优任务，首屏不等待
- 页面懒加载与路由级分包

## [0.1.0] - 2026-08-30

### 新增
- 初始版本：技能市场搜索、一键安装、MCP 管理、翻译、GitHub 搜索
- 自定义标题栏、右键菜单、可折叠边栏、帮助菜单
- 真实应用截图与 README 文档
