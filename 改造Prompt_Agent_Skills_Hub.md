# Phase 9 · CLI + MCP：让 AI 反过来调用技能管理器

> 补充到 `改造Prompt_Agent_Skills_Hub.md`，作为 Phase 9
> 依赖：Phase 3（Tool Adapter）—— CLI 需要复用适配器才知道往哪装
> 撰写日期：2026-09-01

---

## 零、先给你一个好消息：基础设施已经在了

`src-tauri/src/debug_server.rs`（449 行）已经是一个完整的 HTTP 命令网关：

- 监听 `127.0.0.1:17890`
- `POST /api/command`，body 为 `{"action": "<name>", "args": {...}}`
- 内部一个大 `match`，已分发 **31 个后端能力**：
  `fetch_skills` / `search_skills` / `install_skill_streamed` / `scan_local_skills` /
  `remove_skill` / `toggle_skill` / `update_skill_streamed` / `export_skills` / `get_config` …
- `GET /` 返回完整的命令清单与参数示例（已经写好了文档字符串）
- `GET /health`

**也就是说：AI 调用你的管理器，网络层和命令层已经打通了。**
缺的是：CLI 入口、MCP 协议层、认证、以及「为 Agent 优化的语义」。

### ⚠️ 但同时这是一个安全问题

`main.rs:416`：

```rust
.setup(|app| {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        debug_server::start(handle).await;   // ← 没有 cfg(debug_assertions) 保护
    });
```

**生产构建里这个端口也开着，且无任何认证。**
同机任何进程都能 `POST /api/command` 执行 `install_skill_streamed`（内部会 `git clone`）、
`remove_skill`（删文件）、`save_config`（可写入 GitHub Token）。

**这一节必须和 CLI/MCP 一起做，不能只加不管。**

---

## 一、架构决策：抽一个 core crate

现在的逻辑全部锁在 Tauri 命令里（`#[tauri::command]` 函数），无法被独立 CLI 复用。

### 方案对比

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A. CLI 直连 GUI | CLI 通过 HTTP 调 17890 | 改动最小，复用 GUI 缓存 | GUI 必须开着 |
| B. 抽 core crate | 逻辑下沉到 `skills-core`，GUI 和 CLI 都依赖 | 单一实现，CLI 可独立跑 | 重构量较大 |
| **C. B 为主 + A 可选** | 抽 core；CLI 默认直连 core，加 `--daemon` 时走 HTTP | 两种好处都要 | 工作量最大 |

**建议选 B（先做），C 作为后续增强。**

理由：CLI 的核心场景是「AI 在终端里调」，此时 GUI 大概率没开。
如果 CLI 必须依赖 GUI 运行，这个功能的可用性会大打折扣。
而且抽 core 之后，Phase 3 的 ToolAdapter、Phase 2 的抓取逻辑全都能被 CLI 复用。

### 目标结构

```
trae-skill-manager/
├── crates/
│   └── skills-core/          # 新增：纯逻辑，无 Tauri 依赖
│       ├── src/
│       │   ├── lib.rs
│       │   ├── fetch.rs      # 从 commands/fetch.rs 迁过来
│       │   ├── install.rs
│       │   ├── scan.rs
│       │   ├── tools/        # Phase 3 的 ToolAdapter
│       │   ├── cache.rs      # 缓存与配额
│       │   └── config.rs
│       └── Cargo.toml        # 依赖：reqwest, serde, tokio, dirs（不含 tauri）
├── crates/
│   └── skills-cli/           # 新增：CLI 二进制
│       ├── src/main.rs
│       └── Cargo.toml        # 依赖：skills-core, clap, mcp-sdk
└── src-tauri/                # 改为依赖 skills-core，命令层只做薄壳
```

**关键约束**：
- `skills-core` **不得**依赖 `tauri`，否则 CLI 会被迫拉起整个 GUI 栈
- `skills-core` 里的函数签名从「Tauri 命令风格」改为「普通 async fn 风格」
- `src-tauri/src/commands/*` 保留原命令名与参数，**内部改为调用 core**，保证零回归（同 Phase 3.2 的思路）
- 缓存路径、配置路径必须 GUI 与 CLI 共用同一份（现在 GUI 用 `dirs::data_dir()/trae-skill-manager/`，沿用）

---

## 二、CLI 设计

### 命名

主推 **`skillctl`**。
不要叫 `skills`（与 Vercel 的 `npx skills` 冲突）、也不要叫 `tsm`（绑死 Trae，与项目改名冲突）。

### 命令表

```bash
# 发现
skillctl search <query>              # 搜索技能（本地缓存优先，后台刷新）
skillctl info <source>/<slug>        # 查看详情，含 SKILL.md 全文
skillctl trending [--limit N]        # 趋势榜
skillctl recommend "<任务描述>"        # ← 杀手锏：描述任务，推荐技能

# 管理
skillctl list                        # 已安装（默认当前工具）
skillctl install <source>/<slug>     # 安装
skillctl remove <name>               # 卸载
skillctl update [name]               # 升级（不给名字则全部）
skillctl rollback <name>             # 回滚
skillctl enable/disable <name>       # 启停

# 环境
skillctl tools                       # 列出检测到的 AI 工具 + 状态（已装/运行中）
skillctl doctor                      # 健康诊断（Phase 7.1 的能力，CLI 化）

# 服务
skillctl mcp serve                   # 以 MCP Stdio Server 启动（给 AI 用）
skillctl daemon [--port N]           # 后台 HTTP 网关（供 GUI/CLI 共享缓存）

# 批量
skillctl pack export <file>          # 导出技能栈 Preset
skillctl pack import <file>          # 导入
```

### 全局参数

```bash
--json              结构化输出（Agent 必用，人类可读模式为默认）
--tool <id>         指定目标工具（trae|claude-code|cursor|codex），默认跟随检测
--project <path>    安装到项目级；不给则全局
--yes, -y           跳过确认（危险操作仍需 --force）
--dry-run           只打印将要做什么，不实际执行
--no-network        离线模式，只用本地缓存
--quiet, -q         只输出结果，抑制进度与日志
```

### 输出设计（关键）

**人类模式**（默认）：
```
$ skillctl recommend "我要从 PDF 里提取表格数据"

找到 3 个相关技能：

  1. pdf            anthropics/skills    ★ 2.1k   已装 → Cursor
     从 PDF 提取文本与表格、填充表单、合并文档
  
  2. docx           anthropics/skills    ★ 2.1k   未安装
     Word 文档创建与编辑
  
  3. table-extract  mattpocock/skills    ★ 340    未安装
     结构化数据抽取

安装第 1 个？已有。建议安装 #2：skillctl install anthropics/skills/docx
```

**JSON 模式**（Agent 用）：
```json
{
  "ok": true,
  "data": {
    "query": "我要从 PDF 里提取表格数据",
    "results": [
      {
        "id": "anthropics/skills/pdf",
        "name": "pdf",
        "source": "anthropics/skills",
        "description": "从 PDF 提取文本与表格...",
        "stars": 2100,
        "score": 0.87,
        "installed": true,
        "installedIn": ["cursor"]
      }
    ]
  },
  "error": null
}
```

**统一信封**：`{ok, data, error, warnings}` + 进程退出码（0 成功 / 1 业务失败 / 2 参数错误）。
Agent 解析时只看 `ok` 和 `data`，出错时 `error.message` 必须是**可行动的自然语言**
（不要给 Rust panic 栈）。

### 依赖

```toml
clap = { version = "4", features = ["derive"] }
colored = "2"        # 终端着色，--json 时自动关闭
```

---

## 三、MCP Server 设计（真正的重头戏）

### 为什么必须有 MCP

CLI 是给「人敲命令」和「AI 执行 shell」用的；
**MCP 是给「AI 原生调用」用的**——Claude Code / Cursor / Codex / Trae 都支持 MCP，
接上之后 AI 不需要知道命令怎么敲，直接在工具列表里看到 `search_skills` 就会用。

**这是让技能管理器「进入 AI 工作流」的唯一方式。**

### 传输方式

**Stdio**（首要）：`skillctl mcp serve`，进程常驻，通过 stdin/stdout 收发 JSON-RPC。
配置到各家 MCP 配置里即可（Phase 6 的转译层正好能自动写入）。

```json
{
  "mcpServers": {
    "skill-hub": {
      "command": "skillctl",
      "args": ["mcp", "serve"]
    }
  }
}
```

**HTTP/SSE**（可选）：复用 debug_server，供多客户端共享。

### Tools 设计（严格控制在 7 个）

MCP tool 不是越多越好，超过 10 个模型就开始选不准。精挑这 7 个：

| Tool | 参数 | 说明 |
|---|---|---|
| `search_skills` | `query`, `limit?` | 搜索技能，返回精简列表（不含全文） |
| `get_skill_detail` | `source`, `slug` | 返回 SKILL.md 全文 + 文件清单 |
| `recommend_skills_for_task` | `task`, `limit?` | **杀手锏**：描述任务 → 推荐技能 + 理由 |
| `list_installed_skills` | `tool_id?`, `scope?` | 已装清单 |
| `install_skill` | `source`, `slug`, `tool_id?`, `scope?`, `confirm?` | 安装 |
| `remove_skill` | `name`, `tool_id?` | 卸载（**要求 confirm**） |
| `detect_tools` | — | 本机有哪些 AI 工具、哪些在跑、当前工作区 |

**`recommend_skills_for_task` 是差异化核心。**

它把「搜索」升级为「顾问」：AI 描述「我要重构一个 React 项目的状态管理」，
返回的不只是关键词匹配结果，而是带**推荐理由**的排序列表：

```json
{
  "recommendations": [
    {
      "skill": "react-best-practices",
      "source": "vercel-labs/agent-skills",
      "reason": "你的任务涉及 React 状态管理重构，该技能涵盖 Zustand/Redux 迁移模式",
      "confidence": 0.82,
      "installed": false
    }
  ],
  "suggested_action": "install react-best-practices"
}
```

实现上**不需要 LLM**：复用 `fetch.rs:1341` 已有的 `relevance_score`，
加上标签加权、分类匹配、安装量兜底，再套一层「理由模板」即可。
（可作为可选项接入 LLM 提升质量，但绝不能是必需依赖——见硬约束 6。）

### Resources（让 AI 能「读」）

```
skills://installed           当前已装技能清单（Markdown）
skills://installed/{tool}    指定工具的已装清单
skills://catalog             全量目录摘要（体积大，按需分页）
```

Resources 的价值：AI 可以在**不调用 tool** 的情况下把已装技能读进上下文，
正好符合 Agent Skills 的「按需加载」哲学。

### Prompts（斜杠命令）

```
/find-skill   「我需要 <任务>，帮我找并装上合适的技能」
/audit-skills 「审查我的技能栈，找出冗余、冲突和质量问题」
```

### MCP SDK

Rust 生态推荐用官方的 `rmcp`（`modelcontextprotocol/rust-sdk`）。
动手前请确认当前版本 API，这个 crate 迭代较快。

---

## 四、自举：把管理器本身做成一个 Skill（最妙的闭环）

这是整个设计里我最喜欢的一环，**成本极低、传播性极强**。

生成一个 `SKILL.md`，内容是教 AI「当你能力不够时，自己去找技能装」：

```markdown
---
name: skill-discovery
description: 当你缺少完成某个任务所需的专业能力，或用户要求的领域知识超出你的默认能力时，
  使用本技能搜索并安装 Agent Skill。适用场景：用户提到某个专业领域（PDF 处理、数据可视化、
  特定框架最佳实践、行业规范），而当前没有对应技能可用。
allowed-tools: Bash(skillctl:*)
---

# 技能发现与安装

## 何时使用

- 用户提到的任务需要专业知识，但你没有对应技能
- 你发现自己在重复编写同类指令
- 用户明确说「装个技能来做这个」

## 指令

1. 先检查本机已有的技能，避免重复安装：
   skillctl list --json

2. 用任务描述搜索推荐（比关键词搜索更准）：
   skillctl recommend "<用一句话描述用户的任务>" --json

3. 查看候选技能详情，确认它真的匹配：
   skillctl info <source>/<slug> --json

4. 向用户说明你要装什么、为什么，得到同意后安装：
   skillctl install <source>/<slug>

5. 安装后告知用户技能已就绪，可以直接使用。

## 注意

- 不要未经用户确认就安装技能
- 优先推荐官方源（anthropics、vercel-labs、google、microsoft 等）
- 如果搜索不到合适的，如实告诉用户，不要装不相关的技能凑数
```

**效果**：把这个 skill 装到 Trae / Claude Code / Cursor / Codex，
AI 就「学会了」自己扩展能力。你甚至可以在应用里做个
「一键把 skill-discovery 装到所有检测到的工具」的按钮。

**这形成了一个自举闭环**：你的管理器 → 给 AI 装技能 → 其中一个是教 AI 用你的管理器。

---

## 五、安全边界（AI 能操作文件系统，必须设防）

CLI/MCP 一旦开放，AI 就有了「装任意 GitHub 仓库到本地」的能力。
必须做这些：

1. **安装确认**：MCP 的 `install_skill` 默认 `confirm: false` 时返回一条「待确认」响应，
   要求 AI 向用户复述「要装什么、来自哪个仓库、装到哪」并得到同意后再带 `confirm: true` 调用
2. **卸载更严格**：`remove_skill` 必须先返回「将要删除的路径」，二次确认才执行
3. **路径沙箱**：所有写操作限制在「已注册的 AI 工具技能目录」内，
   拒绝 `../` 穿越、绝对路径写入非技能目录
4. **源白名单**（可选，默认关闭）：设置里可配「只允许从这些 org 安装」
   （如 `anthropics`、`vercel-labs`、`google`、`microsoft`），开启后其他源一律拒绝
5. **审计日志**：所有 CLI/MCP 触发的写操作记入历史（复用现有 `InstallRecord`），
   标注来源为 `cli` / `mcp`，与 GUI 操作区分
6. **现有 debug_server 必须加认证**：
   - 改为默认**不启动**，只在设置里显式开启时启动
   - 启动时生成一个随机 token 写入配置文件，请求需带 `Authorization: Bearer <token>`
   - 只监听 `127.0.0.1`（已经是了，保持）
   - 生产构建里加 `cfg` 保护或设置开关

---

## 六、工作量与优先级

| 子任务 | 预估 | 依赖 |
|---|---|---|
| 9.1 debug_server 安全加固 + 改名为 local-api | 半天 | 无，**建议最先做** |
| 9.2 抽 skills-core crate | 1-2 天 | Phase 3 |
| 9.3 CLI 基础命令 | 1 天 | 9.2 |
| 9.4 MCP Server（7 tools + resources） | 1-2 天 | 9.2 |
| 9.5 recommend 算法 | 半天 | 9.2 |
| 9.6 skill-discovery 自举技能 | 2 小时 | 9.3 |
| 9.7 安全边界与审计 | 半天 | 9.3/9.4 |

**建议顺序**：9.1（安全，独立可先做）→ Phase 3 → 9.2 → 9.3/9.4 → 9.5/9.6 → 9.7

---

# 投喂给 AI 的 Prompt 正文

```markdown
## 任务：为技能管理器增加 CLI 与 MCP Server，让 AI Agent 能调用它

### 现状（我已核实，不要重复探索）

项目里已有一个 HTTP 命令网关 src-tauri/src/debug_server.rs（449 行）：
- 监听 127.0.0.1:17890，路由 /  /health  POST /api/command
- POST /api/command 接收 {"action":"<name>","args":{...}}，
  内部一个大 match 已分发 31 个后端能力
- GET / 返回完整命令清单和参数示例（文档字符串已写好）
- 在 main.rs:416 的 setup 里无条件 spawn 启动

问题：
1. 生产构建也启动，无任何认证，同机任意进程可调用
   install_skill_streamed（内部 git clone）、remove_skill（删文件）、save_config
2. 逻辑锁在 #[tauri::command] 函数里，无法被独立 CLI 复用

### 目标

让 AI 编程工具（Trae / Claude Code / Cursor / Codex）能：
1. 通过 CLI 搜索、安装、管理技能
2. 通过 MCP 原生调用（重点）
3. 最终能让 AI 自主发现并安装自己需要的技能

### 执行步骤

#### 步骤 1 · 安全加固先行（半天，必须最先做）

1. 把 debug_server.rs 重命名为 local_api.rs，模块名同步
2. 改为默认不启动：
   - 在 AppConfig 里加 localApi: { enabled: bool, port: u16, token: String }
   - main.rs 里只在 config.localApi.enabled 为 true 时启动
   - 生产构建加 cfg 保护或强制读取配置开关
3. 加认证：
   - 首次启动时生成随机 token（用 rand 或 getrandom），写入配置文件，权限 600
   - 请求必须带 Authorization: Bearer <token>，否则 401
   - /health 可以免认证（用于探测）
4. 保持只监听 127.0.0.1
5. 加一个 CORS 兜底和请求体大小限制

验收：配置关闭时端口不通；配置开启时无 token 请求返回 401。

#### 步骤 2 · 抽取 skills-core crate（1-2 天，依赖 Phase 3）

1. 在仓库根建 crates/skills-core，Cargo.toml 只依赖
   reqwest / serde / serde_json / tokio / dirs / chrono / futures，
   严禁依赖 tauri
2. 把以下逻辑从 src-tauri/src/commands/ 迁移进去，改为普通 async fn：
   - fetch.rs 的抓取、缓存、搜索、relevance_score、仓库元信息
   - install.rs 的安装事务（git clone → degit → skills add 降级链）
   - scan.rs 的本地扫描
   - update.rs 的升级回滚
   - Phase 3 的 tools/ 适配器
3. src-tauri/src/commands/* 保留原命令名和参数签名，
   内部改为调用 skills-core，确保 GUI 行为零回归（同 Phase 3.2 要求）
4. 缓存与配置路径 GUI 和 CLI 必须共用同一份
   （现为 dirs::data_dir()/trae-skill-manager/，沿用）

验收：抽完之后 GUI 所有功能行为与之前完全一致。

#### 步骤 3 · CLI（1 天）

1. 建 crates/skills-cli，依赖 skills-core + clap4 + colored
2. 二进制名 skillctl
3. 实现这些命令：
   search / info / trending / recommend / list / install / remove /
   update / rollback / enable / disable / tools / doctor / mcp serve / daemon
4. 全局参数：--json --tool --project --yes --dry-run --no-network --quiet
5. 输出统一信封 {ok, data, error, warnings} + 退出码 0/1/2
   --json 时输出机器可读结构，否则输出带颜色的终端友好格式
6. error.message 必须是可行动的自然语言，不要泄漏 Rust panic 栈
7. doctor 命令复用计划中 Phase 7.1 的健康度诊断逻辑

验收：每个命令 --json 输出能被 jq 解析；--dry-run 确实不产生副作用。

#### 步骤 4 · MCP Server（1-2 天，重点）

1. 用 Rust MCP SDK（官方 rmcp / modelcontextprotocol rust-sdk，
   动手前确认当前版本 API）
2. skillctl mcp serve 以 Stdio 传输启动
3. 实现 7 个 tools（严格按此清单，不要加）：
   - search_skills(query, limit?)
   - get_skill_detail(source, slug)
   - recommend_skills_for_task(task, limit?)
   - list_installed_skills(tool_id?, scope?)
   - install_skill(source, slug, tool_id?, scope?, confirm?)
   - remove_skill(name, tool_id?)
   - detect_tools()
4. 实现 resources：skills://installed、skills://installed/{tool}
5. 实现 prompts：/find-skill、/audit-skills
6. recommend_skills_for_task 是差异化核心：
   复用 fetch.rs 已有的 relevance_score，加标签加权、分类匹配、安装量兜底，
   每条推荐必须带 reason 字段（人类可读的推荐理由）和 confidence
   不得依赖 LLM，纯本地算法实现
7. 每个 tool 的 description 要写得让模型知道「什么时候该用它」，
   这是 MCP 效果好坏的关键，请认真写

验收：
- 配置到 Claude Code / Cursor 的 MCP 配置里能被识别
- AI 能用自然语言触发正确的 tool
- 安装类操作默认要求确认

#### 步骤 5 · 安全边界（半天）

1. install_skill：confirm 为 false 或不传时，返回待确认响应，
   内容为「将要安装 <name>，来自 <source>，目标 <tool>/<scope>」
   AI 需向用户复述并获得同意后，带 confirm: true 再次调用
2. remove_skill：必须先返回待删除路径，二次确认才执行
3. 路径沙箱：所有写操作限制在已注册工具的技能目录内，
   拒绝 ../ 穿越和非法绝对路径
4. 源白名单（可选功能，默认关闭）：设置里可配允许的 org 列表
5. 审计：所有 CLI/MCP 触发的写操作记入 InstallRecord，
   来源标记为 cli / mcp，与 GUI 操作区分

#### 步骤 6 · 自举技能（2 小时）

1. 在应用内置一个 skill-discovery 技能包（SKILL.md）
2. 内容教 AI：当缺少能力时用 skillctl 搜索安装
   含何时使用、具体命令步骤、注意事项（参考我给的模板）
3. allowed-tools 声明为 Bash(skillctl:*)
4. UI 里加一个「一键把 skill-discovery 装到所有检测到的工具」按钮

### 硬约束（除全局约束外）

- skills-core 不得依赖 tauri
- GUI 命令名与参数签名不得变更（零回归）
- MCP tools 严格控制在 7 个以内，不得擅自增加
- 任何 AI 可触发的写操作必须有确认或沙箱保护
- 不得引入 LLM 作为必需依赖

### 交付

- 每个步骤完成后说明改了什么、怎么验证
- MCP 部分请给出一份可直接粘贴到各工具 MCP 配置的 JSON 片段
- 给出 3 个「AI 自主使用技能管理器」的真实场景演示
  （比如：AI 写 PDF 处理代码时自主发现并安装 pdf 技能）
```

---

## 七、这个功能的战略价值

做完 Phase 9，你的产品形态会发生一个质变：

| 之前 | 之后 |
|---|---|
| 人打开 GUI 找技能 | AI 在干活时自主找技能 |
| 单向：你服务用户 | 双向：你也服务 AI |
| 工具 | **AI 的能力基础设施** |

而且 `skill-discovery` 自举技能意味着：**用户装了你的东西，AI 就会主动帮你推广它**
——每次 AI 说「我发现你没有这个技能，要装吗」，都是一次产品曝光。

这是竞品（SkillsLM、Skills Manager、agent-skill-manager）**全部没有做**的方向。
它们都停留在「给人用的 GUI」，没有一家把 MCP 接口开放出来。
