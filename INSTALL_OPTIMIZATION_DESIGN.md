# TRAE Skill Manager - 技能安装机制优化设计方案

> **版本**: v1.0  
> **日期**: 2026-06-23  
> **状态**: 待评审

---

## 一、问题现状与验证

经过代码审计和运行验证，当前技能安装机制存在 **8 个已确认问题**，其中 4 个为严重问题。

### 1.1 严重问题（P0）

| 编号 | 问题 | 影响程度 | 验证方式 |
|------|------|----------|----------|
| P0-1 | **配置路径与安装路径脱节** | 🔴 严重 | 代码验证：`install.rs` 不读取 `global_skills_path` 配置，使用内部 `detect_skills_path()` |
| P0-2 | **假数据（安装量）** | 🔴 严重 | 代码验证：25 个内置技能的安装量完全硬编码（总计 249,800 次虚构安装），真实数据源获取的技能 installs 均为 0 |
| P0-3 | **安装后验证缺失** | 🔴 严重 | 代码验证：仅判断命令退出码，不验证 SKILL.md 是否存在于目标位置 |
| P0-4 | **历史记录功能完全失效** | 🔴 严重 | 代码搜索：`add_history_record` 在整个代码库中 **0 次调用** |

### 1.2 一般问题（P1）

| 编号 | 问题 | 影响程度 | 验证方式 |
|------|------|----------|----------|
| P1-1 | **安装路径检测不一致** | 🟡 中等 | 代码验证：`install.rs` 有 3 个候选路径，`main.rs` 有 4 个，差了 `.trae/skills` 和 `AppData/Local/Trae/skills` |
| P1-2 | **已安装检测不可靠** | 🟡 中等 | 代码验证：基于 `name` 相等 + `path.includes(source)` 的子串匹配，存在误判风险 |
| P1-3 | **子技能路径匹配覆盖不足** | 🟡 中等 | 代码验证：git clone 方式只尝试 2 种路径（`skills/<name>` 和 `<name>`），不递归搜索 |
| P1-4 | **技能名与目录名不一致风险** | 🟡 中等 | 代码验证：安装目标目录用 `skill_name`，扫描时优先用目录名，SKILL.md 中的 name 仅作 fallback |

### 1.3 问题根因分析

```
┌─────────────────────────────────────────────────────────────┐
│                      核心根因                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 安装流程与配置系统完全解耦 — 安装命令不接受 path 参数    │
│  2. 数据来源混杂，缺少统一的数据质量层                       │
│  3. 操作无事务性 — 失败可能留下脏数据                         │
│  4. 缺少技能元数据（manifest）规范 — 没有唯一标识体系         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、优化目标

### 2.1 核心目标

1. **正确性**: 安装必须到用户配置的路径，安装结果必须可验证
2. **可靠性**: 安装/卸载有完整的历史记录，失败可回滚
3. **数据真实**: 不展示假数据，未知数据明确标注
4. **可维护性**: 统一路径检测逻辑，统一数据模型

### 2.2 量化指标

| 指标 | 当前状态 | 目标状态 |
|------|----------|----------|
| 配置路径使用率 | 0%（安装忽略配置） | 100% |
| 安装后验证率 | 0% | 100%（验证 SKILL.md 存在） |
| 历史记录覆盖率 | 0% | 100%（安装/卸载/切换均记录） |
| 假数据比例 | ~100%（大部分技能 installs=0 或假数据） | 0%（无数据则不显示或显示"未知"） |
| 路径检测一致性 | 不一致（2套逻辑） | 100% 一致（统一函数） |

---

## 三、详细优化方案

### 方案一：统一路径管理（解决 P0-1 + P1-1）

#### 问题描述
- `install.rs` 有自己的 `detect_skills_path()`，不读取配置
- `main.rs` 也有 `detect_skills_path()`，用于配置默认值
- 两个函数的候选路径列表不一致
- 用户在设置页修改路径后，安装功能完全不生效

#### 设计方案

**1. 统一路径工具模块**

```
src-tauri/src/utils/path.rs  (新建)
  ├── detect_skills_path()     -> 统一的自动检测逻辑
  ├── get_skills_path(config)  -> 优先用配置，配置为空则自动检测
  └── normalize_path(path)     -> 路径规范化（统一分隔符等）
```

**2. 修改 install_skill_streamed 签名**

```rust
// 之前
async fn install_skill_streamed(app, source, skill_name) -> Result<Vec<LocalSkill>, String>

// 之后
async fn install_skill_streamed(
    app: tauri::AppHandle,
    source: String,
    skill_name: String,
    target_path: Option<String>,  // 新增：目标路径
) -> Result<InstallResult, String>
```

**3. 前端 store 调用时传入路径**

```typescript
// skillStore.ts - installSkillStreamed
const config = get().config;
const skills = await invoke<LocalSkill[]>('install_skill_streamed', {
  source,
  skillName,
  targetPath: config.globalSkillsPath || undefined,  // 传入配置路径
});
```

**4. 候选路径统一为 5 个**

```
优先级从高到低：
1. 用户配置的 global_skills_path
2. ~/.trae-cn/skills       （TRAE CN 默认路径）
3. ~/.trae/skills          （TRAE 国际版路径）
4. %APPDATA%/Trae/skills   （Windows 漫游配置）
5. %LOCALAPPDATA%/Trae/skills （Windows 本地配置）
```

#### 验收标准
- [ ] 设置页修改路径后，新安装的技能出现在新路径
- [ ] scan 和 install 使用相同的路径检测逻辑
- [ ] 代码中只有一份路径检测函数

---

### 方案二：数据真实性改造（解决 P0-2）

#### 问题描述
- 25 个内置技能的 `installs` 字段是硬编码的假数据
- GitHub Raw / API / npx 三种真实来源获取的技能 `installs` 都是 0
- 用户看到的"安装量"大部分是编造的，严重误导决策

#### 设计方案

**1. 移除假数据，改为真实数据优先 + 降级策略**

```
数据获取优先级（从高到低）：
  1. npx skills search → 有真实 installs 数据（如果 CLI 提供）
  2. GitHub API → 获取 star 数作为替代指标（标注为 stars）
  3. GitHub Raw → 无数据，installs 显示为 null
  4. 内置 fallback → 无数据，不显示安装量
```

**2. 新增数据来源标识**

```typescript
interface RemoteSkill {
  // ... 现有字段
  installs: number | null;  // null 表示未知
  stars?: number;           // GitHub stars（如果有）
  dataSource: 'npx' | 'github-api' | 'github-raw' | 'fallback';  // 数据来源
}
```

**3. 前端展示改造**

```
有真实 installs:    "2.5K installs"
有 stars 无 installs: "★ 12.3K"  （标注为 stars）
无数据:             不显示安装量数字，或显示 "未知"
```

**4. 移除 get_built_in_skills() 中的假 installs**

```rust
// 之前
RemoteSkill {
    id: "anthropics/skills/web-search".to_string(),
    installs: 20000,  // 假数据！
    ...
}

// 之后
RemoteSkill {
    id: "anthropics/skills/web-search".to_string(),
    installs: 0,      // 明确表示未知/无数据
    data_source: "fallback".to_string(),
    ...
}
```

#### 验收标准
- [ ] 代码中不存在硬编码的虚构安装量数字
- [ ] 用户能区分真实安装量、GitHub stars 和未知数据
- [ ]  fallback 数据明确标识为"备用数据"

---

### 方案三：安装验证与事务性（解决 P0-3）

#### 问题描述
- 安装成功仅判断命令退出码，不验证文件是否真的到位
- git clone 成功但 sub-skill 路径找错时，可能安装了错误的内容
- 安装失败时可能留下部分脏文件
- 用户无法知道安装的内容是否完整

#### 设计方案

**1. 安装结果结构体**

```rust
pub struct InstallResult {
    pub success: bool,
    pub skill_name: String,
    pub skill_path: String,       // 实际安装路径
    pub method: String,           // "git" | "degit" | "npx"
    pub verified: bool,           // 是否通过验证
    pub error: Option<String>,
    pub files_installed: u32,     // 安装的文件数
}
```

**2. 安装后验证清单**

```
验证步骤（全部通过才算成功）：
  ✓ 目标目录存在
  ✓ SKILL.md 存在（启用状态）
  ✓ SKILL.md 可读取且非空
  ✓ 至少有 1 个文件（不包括空目录）
  ✓ 目录不是临时残留（通过 .git 等判断）
```

**3. 事务性安装（原子操作）**

```
安装流程改造：
  1. 下载/克隆到临时目录: <temp>/trae-install-<pid>/<skill>/
  2. 在临时目录中验证 SKILL.md
  3. 验证通过 → 移动/复制到目标位置
  4. 验证目标位置 → 返回成功
  5. 任何步骤失败 → 清理临时目录 → 返回错误
```

**4. 失败回滚**

```rust
// 伪代码
async fn install_with_rollback(...) -> Result<InstallResult, String> {
    let temp_dir = create_temp_dir()?;
    
    // 确保即使 panic 也清理临时目录
    let _guard = scopeguard::guard(temp_dir.clone(), |d| {
        let _ = remove_dir_all(d);
    });

    // 下载到临时目录
    download_to_temp(&temp_dir).await?;
    
    // 验证临时目录
    verify_skill(&temp_dir)?;
    
    // 移动到目标位置（如果目标已存在，先备份）
    if target.exists() {
        backup_target(&target)?;
    }
    move_to_target(&temp_dir, &target)?;
    
    // 最终验证
    verify_skill(&target)?;
    
    Ok(InstallResult { success: true, ... })
}
```

#### 验收标准
- [ ] 安装失败时不会留下脏文件
- [ ] 安装成功必定有 SKILL.md 在目标位置
- [ ] 安装结果包含验证状态和安装方法
- [ ] 覆盖安装时有备份，失败可回滚

---

### 方案四：历史记录系统（解决 P0-4）

#### 问题描述
- `add_history_record` 命令已定义，但 **0 次调用**
- 历史记录页面永远是空的
- 用户无法追溯操作历史

#### 设计方案

**1. 后端自动记录（主方案）**

在每个修改操作的后端命令中自动写入历史：

```rust
// install.rs - 安装成功后
history::add_record(InstallRecord {
    id: generate_id(),
    action: "install".to_string(),
    skill_name: skill_name.clone(),
    source: source.clone(),
    timestamp: SystemTime::now()...,
    success: true,
    message: format!("Installed via {} to {}", method, path),
})?;

// remove.rs - 卸载后
history::add_record(InstallRecord {
    id: generate_id(),
    action: "remove".to_string(),
    skill_name: ...,
    ...
})?;

// toggle.rs - 切换后
history::add_record(InstallRecord {
    action: if enabled { "enable" } else { "disable" }.to_string(),
    ...
})?;
```

**2. 历史记录数据结构增强**

```rust
pub struct InstallRecord {
    pub id: String,
    pub action: String,           // "install" | "remove" | "enable" | "disable" | "update"
    pub skill_name: String,
    pub skill_source: String,     // source repo
    pub skill_version: Option<String>,
    pub method: Option<String>,   // "git" | "degit" | "npx"
    pub install_path: Option<String>,
    pub timestamp: i64,
    pub success: bool,
    pub message: String,
    pub duration_ms: Option<u64>, // 操作耗时
}
```

**3. 历史记录存储**

```
文件位置: %APPDATA%/trae-skill-manager/history.json
格式: JSON 数组，按时间倒序
限制: 最多保留 500 条（超出自动清理最旧的）
```

#### 验收标准
- [ ] 每次安装/卸载/启用/禁用都有历史记录
- [ ] 历史记录页显示真实数据
- [ ] 记录包含操作方法、路径、耗时等有用信息
- [ ] 历史记录持久化到本地文件

---

### 方案五：可靠的已安装检测（解决 P1-2 + P1-4）

#### 问题描述
- 当前检测逻辑：`name 相等 && path.includes(source)`
- 子串匹配容易误判
- 没有技能唯一标识，同名技能会混淆

#### 设计方案

**1. 引入技能清单（manifest.json）**

每个已安装技能目录下生成/更新一个 `skill.manifest.json`：

```json
{
  "id": "anthropics/skills/web-search",
  "name": "web-search",
  "source": "anthropics/skills",
  "sourceType": "github",
  "version": "1.0.0",
  "installMethod": "git",
  "installedAt": 1719129600000,
  "updatedAt": 1719129600000,
  "enabled": true,
  "hash": "abc123..."
}
```

**2. 检测逻辑升级**

```typescript
// 之前：模糊匹配
const isInstalled = localSkills.some(ls => 
  ls.name === skill.name && ls.path.includes(source)
);

// 之后：精确匹配（通过 manifest id）
const isInstalled = localSkills.some(ls => 
  ls.manifestId === skill.id  // 唯一 ID 精确匹配
);
```

**3. 扫描时优先读取 manifest**

```
scan_directory 流程：
  1. 遍历子目录
  2. 检查是否有 skill.manifest.json
     ✓ 有 → 读取 manifest 中的元数据（权威数据）
     ✗ 无 → 解析 SKILL.md（兼容旧安装）
  3. 检查 SKILL.md / SKILL.md.disabled 确定启用状态
```

#### 验收标准
- [ ] 新安装的技能都有 manifest.json
- [ ] 已安装检测通过唯一 ID 精确匹配
- [ ] 兼容旧的无 manifest 的安装（降级到 SKILL.md 解析）
- [ ] 同名不同源的技能不会误判

---

### 方案六：智能子技能路径发现（解决 P1-3）

#### 问题描述
- git clone 方式只尝试 `skills/<name>` 和 `<name>` 两种路径
- 仓库结构多样，很多情况安装失败
- 没有充分利用 `list_repo_skills` 已经获取的路径信息

#### 设计方案

**1. 安装时携带路径信息**

```rust
// 之前
install_skill_streamed(source, skill_name)

// 之后
install_skill_streamed(source, skill_name, skill_path_hint)
// skill_path_hint: "skills/web-search" （来自 list_repo_skills 的结果）
```

**2. 多级路径探测策略**

```
在克隆后的仓库中找 SKILL.md，按优先级：
  1. 直接使用传入的 path_hint（最准确）
  2. skills/<skill_name>/SKILL.md
  3. <skill_name>/SKILL.md
  4. 递归搜索（深度不超过 3 层），找匹配 skill_name 的目录
  5. 根目录 SKILL.md（单技能仓库）
```

**3. 递归搜索安全限制**

```
递归搜索限制：
  - 最大深度: 3 层
  - 最大目录数: 50 个
  - 找到第一个匹配即返回
  - 完全匹配 skill_name 优先于部分匹配
```

#### 验收标准
- [ ] 支持 5 种以上常见仓库结构
- [ ] 利用 list_repo_skills 的路径信息提高准确率
- [ ] 递归搜索有安全限制，不会卡住
- [ ] 找不到时给出清晰的错误提示

---

## 四、实施路线图

### 阶段一：紧急修复（P0 问题）

**预计工作量**: 2-3 天  
**目标**: 解决最严重的 4 个问题

| 任务 | 对应方案 | 优先级 |
|------|----------|--------|
| 1. 统一路径管理，安装时使用配置路径 | 方案一 | P0 |
| 2. 移除假数据，增加 dataSource 标识 | 方案二 | P0 |
| 3. 安装后验证 + 事务性安装 | 方案三 | P0 |
| 4. 后端自动记录操作历史 | 方案四 | P0 |

### 阶段二：体验优化（P1 问题）

**预计工作量**: 2-3 天  
**目标**: 提升可靠性和用户体验

| 任务 | 对应方案 | 优先级 |
|------|----------|--------|
| 5. 技能 manifest + 精确已安装检测 | 方案五 | P1 |
| 6. 智能子技能路径发现 | 方案六 | P1 |

### 阶段三：增强功能（可选）

**预计工作量**: 2-3 天  
**目标**: 增值功能

| 任务 | 说明 |
|------|------|
| 7. 技能更新检测 | 检查远程是否有新版本 |
| 8. 批量导出/导入 | 迁移技能列表到另一台机器 |
| 9. 安装进度细化 | 显示当前步骤（下载中/验证中/安装中） |

---

## 五、风险与注意事项

### 5.1 兼容性风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| manifest 引入导致旧安装的技能无法识别 | 中 | 扫描时优先用 manifest，fallback 到 SKILL.md 解析 |
| 路径变更导致已安装技能找不到 | 高 | 提供"迁移技能"功能，或扫描多路径合并显示 |
| 假数据移除导致用户困惑 | 低 | 明确标注数据来源，添加 tooltip 解释 |

### 5.2 性能影响

| 改动 | 性能影响 | 说明 |
|------|----------|------|
| 安装后验证 | 可忽略 | 只检查几个文件是否存在 |
| manifest 读写 | 可忽略 | JSON 文件很小 |
| 递归搜索 SKILL.md | 低 | 有深度和数量限制，且只在安装时执行 |
| 历史记录写入 | 可忽略 | 追加写入小文件 |

---

## 六、验证与测试方案

### 6.1 单元测试

```
测试用例清单：
  ✓ 路径检测：5 个候选路径的优先级正确
  ✓ 安装验证：SKILL.md 存在 → 成功，不存在 → 失败
  ✓ 事务性：安装中断不会留下脏文件
  ✓ 历史记录：每次操作都有记录
  ✓ 已安装检测：同名单源正确识别，同名异源不混淆
  ✓ 路径探测：6 种仓库结构都能正确找到 SKILL.md
```

### 6.2 集成测试

```
场景测试：
  1. 设置页改路径 → 安装新技能 → 验证出现在新路径
  2. 安装已知仓库技能 → 验证历史记录有一条
  3. 卸载技能 → 验证目录删除 + 历史记录
  4. 安装不存在的仓库 → 验证无脏文件 + 错误提示
  5. 两个同名不同源的技能 → 验证分别识别，不混淆
```

### 6.3 数据真实性验证

```
检查项：
  ✓ 代码搜索 "installs" 无硬编码数字（除了 0）
  ✓ RemoteSkill 有 dataSource 字段
  ✓ 前端根据 dataSource 显示不同的指标文案
  ✓ fallback 数据明确标注
```

---

## 七、相关文件改动清单

| 文件 | 改动类型 | 所属方案 |
|------|----------|----------|
| `src-tauri/src/utils/path.rs` | 新建 | 方案一 |
| `src-tauri/src/commands/install.rs` | 重构 | 方案一、三、四、六 |
| `src-tauri/src/commands/remove.rs` | 修改 | 方案四 |
| `src-tauri/src/commands/toggle.rs` | 修改 | 方案四 |
| `src-tauri/src/commands/scan.rs` | 重构 | 方案五 |
| `src-tauri/src/commands/fetch.rs` | 修改 | 方案二 |
| `src-tauri/src/commands/history.rs` | 修改 | 方案四 |
| `src-tauri/src/models.rs` | 修改 | 方案二、三、五 |
| `src-tauri/src/main.rs` | 修改 | 方案一、四 |
| `src/types/index.ts` | 修改 | 方案二、三、五 |
| `src/store/skillStore.ts` | 修改 | 方案一、二、三 |
| `src/components/SkillCard.tsx` | 修改 | 方案二、五 |
| `src/components/HistoryPage.tsx` | 修改 | 方案四 |

---

## 附录 A：假数据清单（待清理）

以下 25 个技能的安装量为硬编码假数据，需移除或改为 0/null：

| ID | 假安装量 |
|----|----------|
| vercel-labs/skills/web-search | 15,000 |
| vercel-labs/skills/github | 12,000 |
| vercel-labs/skills/linear | 8,000 |
| anthropics/skills/web-search | 20,000 |
| anthropics/skills/github | 18,000 |
| anthropics/skills/linear | 10,000 |
| anthropics/skills/notion | 9,000 |
| anthropics/skills/slack | 7,500 |
| anthropics/skills/jira | 6,000 |
| anthropics/skills/stripe | 5,000 |
| anthropics/skills/aws | 4,500 |
| anthropics/skills/postgres | 4,000 |
| anthropics/skills/redis | 3,500 |
| anthropics/skills/docker | 3,000 |
| anthropics/skills/kubernetes | 2,500 |
| anthropics/skills/terraform | 2,000 |
| anthropics/skills/cloudflare | 1,800 |
| modelcontextprotocol/servers/filesystem | 22,000 |
| modelcontextprotocol/servers/github | 20,000 |
| modelcontextprotocol/servers/postgres | 15,000 |
| modelcontextprotocol/servers/slack | 12,000 |
| modelcontextprotocol/servers/google-drive | 10,000 |
| modelcontextprotocol/servers/puppeteer | 8,000 |
| modelcontextprotocol/servers/sentry | 6,000 |
| microsoft/playwright-mcp | 25,000 |
| **总计** | **249,800** |

---

*文档结束*
