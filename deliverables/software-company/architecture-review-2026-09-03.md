# 架构设计评审报告：项目结构分析器 1.0.0

> **评审人**：高见远（架构师）  
> **评审日期**：2026-09-03  
> **项目路径**：`E:\WorkSpeace\WorkSpeace_WorkBuddy\项目结构分析器-1.0.0`  
> **评审性质**：纯架构评审，不修改代码

---

## 结论先行

项目结构分析器是一个**设计意图清晰、工程质量远超同类工具**的单文件零依赖 HTML 工具。其 vm 加载 + 变异验证的测试策略、双路线（浏览器/Electron）等价性校验、噪音目录一致性比对等做法在个人工具项目中属于极高水准。但随着模板从 7 套膨胀到 18 套，**判定流程的脆弱性已经开始暴露**——本次评审实际跑测试即发现 6 项失败，其中 2 项是真实的模板误判 bug（desktop→mini、devops→tool），1 项是副本同步遗漏。**当前架构还能承载 5-6 套新模板（约 24 套总量），超过这个阈值后判定链将不可维护。** 建议在达到 25 套或 3000 行之前完成判定流程重构与模板数据驱动化改造。

---

## 一、架构总览与取舍

### 1.1 整体架构

```
project-analyzer.html (2454 行, 131KB)
├── <style>  CSS 样式（125 行，暗色主题，CSS 变量驱动）
├── <body>   HTML 骨架（按钮 / 槽位 / 输出区 / 隐藏 input）
└── <script> 单 IIFE，全部逻辑（~2290 行）
    ├── 常量层     NOISE / TEXT_RE / MAX_TEXTS / RE_TEST / RE_CI / RE_DOC / RE_SRC
    ├── 模板层     PROFILES{18套} + PROFILE_ORDER + 18× *_PHASE_FILE
    ├── 判定层     detectType / detectProfile + 13× *Score 函数 + hasFrontendSignal
    ├── 分析层     detectPhases / detectArtifacts / detectEngineering / detectProjects
    ├── 建议层     18× advice* 函数 + phaseGap + sortAdv
    ├── 生成层     genIntro / inferModules / genPrompt
    ├── 渲染层     renderCard / renderCompare / renderBoundary / renderScale / render
    ├── I/O 层     analyze / analyzeEntries / analyzeNative / readTexts / buildData
    ├── UI 层      事件绑定 / 状态管理(A/B/CACHE/SCOPE/SEL/RAW_COUNT)
    └── 导出层     window.__PA（暴露 30+ 函数供 vm 测试）
```

**单文件 IIFE 架构的核心取舍：**

| 维度 | 收益 | 代价 |
|------|------|------|
| 零依赖即用 | 双击打开，无需 Node/构建/联网，分发成本为零 | 无法使用模块化、类型系统、lint 工具链 |
| 单文件 | 改完刷新即见，无构建步骤 | 2454 行全在一个 `<script>` 里，导航困难 |
| 浏览器+Electron 双形态 | 浏览器版零门槛，Electron 版解决大目录性能 | 维护两份噪音列表，需手动同步副本 |
| vm 测试 | 能对真实逻辑做断言，不是字符串数数 | harness 需伪造 document/window，DOM 交互无法测 |

**判定：取舍合理。** 对于"个人工具/内部工具"定位，零依赖即用的分发优势远大于模块化的开发便利。但当前已到 2454 行，接近单文件可维护性拐点（详见第五节技术债）。

### 1.2 Electron 打包副本同步机制

同步机制由三部分组成：

1. **`scripts/sync-electron.mjs`**：手动执行 `npm run sync`，将根 html 字节复制到 `build-electron/project-analyzer.html`
2. **`tests/logic.test.mjs` [12]**：断言两份 html 字节一致
3. **README 约定**：提醒开发者"改完根文件要同步"

**评审发现：同步机制当前已失效。** 实测根文件 111,387 字节，副本 91,971 字节，差 19,416 字节——说明根文件更新后未执行 `npm run sync`，而 CI 也未阻断（因为 CI 跑的是 `npm test`，logic.test.mjs 确实会失败，但可能本次提交未触发 CI 或 CI 未被关注）。

**根因**：同步是纯手动操作，依赖开发者记忆，没有 git pre-commit hook 或 CI 前置步骤自动执行。这是典型的"约定优于配置"失效案例——当约定依赖人的记忆时，它迟早会被遗忘。

**改进方向**：在 `npm test` 脚本前自动执行 sync，或添加 pre-commit hook，使同步成为测试流程的自动环节而非独立步骤。

---

## 二、模板扩展机制评审

### 2.1 模板三件套结构

每套模板由以下组件构成，分散在文件的不同位置：

| 组件 | 位置（行号区间） | 说明 |
|------|------------------|------|
| `PROFILES[id]` | 188-611 | phases[] + artifacts[] + advice 引用 |
| `*_PHASE_FILE` | 1296-1435 | 阶段→文件建议的映射表 |
| `advice*(d)` | 1456-1907 | 条件式建议生成函数 |
| `*Score(paths, texts)` | 670-845 | detectProfile/detectType 打分函数 |
| `PROFILE_ORDER` | 613 | 判定顺序数组 |
| `detectProfile` 分支 | 848-930 | if-else 链中的判定分支 |
| `detectType` 分支 | 620-665 | if-else 链中的类型分支 |

### 2.2 新增一套模板的成本分析

新增第 19 套模板需要修改 **8 个位置**：

| 步骤 | 操作 | 风险 |
|------|------|------|
| 1 | 在 PROFILES 对象中添加新 entry（phases + artifacts + advice 引用） | 低，纯数据追加 |
| 2 | 添加 `NEW_PHASE_FILE` 变量 | 低 |
| 3 | 编写 `adviceNew(d)` 函数 | 中，需理解 phaseGap/hasA 模式 |
| 4 | 编写 `newScore(paths, texts)` 函数 | **高**，需设计打分规则且不与其他 score 冲突 |
| 5 | 在 `PROFILE_ORDER` 数组中添加 id（位置敏感！） | **高**，插入位置影响判定优先级 |
| 6 | 在 `detectProfile` 的 if-else 链中插入分支 | **高**，插入位置必须与 PROFILE_ORDER 一致，否则判定逻辑断裂 |
| 7 | 在 `detectType` 的 if-else 链中插入分支 | 中 |
| 8 | 在 `logic.test.mjs` 中添加 fixture | 低 |

### 2.3 扩展成本曲线判断

**当前是线性成本，但斜率偏陡。** 每套模板约需 120-180 行代码（PROFILES ~30行 + PHASE_FILE ~10行 + advice ~40行 + score ~25行 + detectProfile 分支 ~3行 + detectType 分支 ~2行），代码量本身是线性的。

但**隐性成本在加速增长**：
- 第 4 步（score 函数）的难度随模板数增长——新模板的 score 必须与已有 18 个 score 正交，否则出现"一个项目点亮多个 score"的互吞问题
- 第 5-6 步（PROFILE_ORDER + detectProfile 分支位置）的顺序敏感性随模板数增长——18 个分支的顺序已经是精心调试的结果，再加模板会越来越难判断"新模板应该排在谁前面"
- 模板间的特征重叠在加剧（如 server/microservice/cli 都有 package.json + src/，desktop/web/mini 都有 index.html）

**判断：18 套已接近 if-else 链的可维护上限。** 本次评审实测发现 desktop 和 devops 两个模板的判定已被前面的启发式规则"吞掉"（详见第三节），说明 18 套时判定链已经开始出现缝隙。预计再加 5-6 套（总量 24 套）时，互吞问题将频繁到不可接受。

### 2.4 是否该改为数据驱动

**应该，但不是现在。** 当前 PROFILES 的 phases 和 artifacts 已经是数据（正则 + 标签），只有 score 函数和 advice 函数是代码。完全数据驱动（如 JSON 配置 + 通用 advice 引擎）可以消除步骤 3、4、6 的重复劳动，但需要：
- 设计通用的 score 规则 DSL（如 `{match: "*.tf", weight: 3}`）
- 设计通用的 advice 模板引擎（将 advice* 函数的 `if (!hasA.XXX)` 模式抽象为配置）
- 重构 detectProfile 为"打分排序取最高"而非"顺序 if-else"

这是一个 2-3 天的重构工程，建议在模板数达到 22 套时启动。

---

## 三、判定流程健壮性评审

### 3.1 detectProfile 的顺序依赖问题

`detectProfile`（848-930 行）的核心结构是一条 60 行的 if-else 链，判定顺序为：

```
game(类型匹配) → meta(md占比) → mini(文件少+index.html) 
→ iac(≥3) → embedded(≥3) → extension(≥3) → data(≥3) 
→ mobile(≥3) → desktop(≥3) → aiml(≥3) → microservice(≥3) 
→ server(≥3) → cli(≥3) → tool(文件少) → lib(package.json) 
→ web(页面结构) → devops(≥3) → tool(bat/sh) → lib/tool(Python等) → generic
```

**关键设计缺陷：mini 和 tool 的启发式判定（基于文件数量）穿插在 score 判定链中间，会"吞掉"后续的 score 判定。**

### 3.2 实测发现的误判 Bug（本次评审当场复现）

运行 `npm test` 发现 6 项失败，其中 2 项是真实的模板误判：

**Bug 1：desktop → 误判为 mini**

```
desktop fixture: 4 个文件，含 index.html
判定路径: paths.length(4) <= 14 → 有 index.html → idxTxt 匹配 "互动" → return "mini"
                     ↓
           在到达 desktopScore(≥3) 之前就被 mini 吞掉
```

根因：第 861 行的 mini 判定 `paths.length <= 14 && noDesign && anyPath(paths, /(^|\/)index\.html$/i)` 在第 883 行的 `desktopScore(paths, texts) >= 3` 之前执行。desktop fixture 恰好有 index.html 且文件少，被 mini 截胡。

**Bug 2：devops → 误判为 tool**

```
devops fixture: 6 个文件，含 .sh
判定路径: paths.length(6) <= 12 && srcR < 0.5 && mdN < 8 → return "tool"
                     ↓
           在到达 devopsScore(≥3) 之前就被 tool 吞掉
```

根因：第 899 行的 tool 判定 `paths.length <= 12 && srcR < 0.5 && mdN < 8` 在第 923 行的 `devopsScore(paths, texts) >= 3` 之前执行。devops fixture 文件少且无大量源码，被 tool 截胡。

### 3.3 阈值 ≥3 的脆弱性

所有 score 函数统一使用 `>= 3` 作为命中阈值。这个阈值是经验值，存在以下问题：

| 问题 | 说明 |
|------|------|
| 阈值无理论依据 | 不同模板的 score 分布不同，统一阈值 3 缺乏校准 |
| score 之间无归一化 | iacScore 的 3 分（1 个 .tf 文件即得 3 分）比 microserviceScore 的 3 分（需 2 个独立服务才得 3 分）容易得多 |
| 无法表达"否定证据" | 一个项目可能同时满足 iacScore≥3 和 serverScore≥3，当前靠"谁先判断谁赢"解决，但顺序一旦错就误判 |

### 3.4 score 函数互吞风险分析

实测检查 18 个 score 函数之间的特征重叠：

| 重叠对 | 共享特征 | 当前如何消解 | 消解是否可靠 |
|--------|----------|--------------|--------------|
| server ↔ microservice | package.json + routes/ + models/ | microservice 先判(需≥2服务)，server 后判 | 可靠，但 microserviceScore 的 ≥2 服务判定较松 |
| desktop ↔ web | package.json + index.html + 组件目录 | desktop 先判(electron 依赖特征) | **不可靠**，见 Bug 1 |
| data ↔ aiml | data/ + .py 文件 | aiml 先判(需模型权重) | 基本可靠 |
| cli ↔ server | package.json + bin | server 先判(需后端分层) | 基本可靠 |
| devops ↔ tool | .sh 文件 + 少量文件 | **tool 先判(文件少)** | **不可靠**，见 Bug 2 |
| iac ↔ devops | CI 配置 + 部署脚本 | iac 先判(.tf 最特异) | 可靠 |

**有 2 组消解不可靠**，与实测发现的 2 个 bug 吻合。

### 3.5 改进方案对比

| 方案 | 描述 | 收益 | 成本 | 推荐度 |
|------|------|------|------|--------|
| **A. 修正分支顺序** | 将所有 score 判定移到 mini/tool 启发式之前 | 立即修复已知 bug | 低（移几行代码） | ★★★ 短期必做 |
| **B. 打分排序取最高** | 去掉 if-else 链，计算所有 score 取最大值，平局按优先级表 | 彻底消除顺序依赖 | 中（重构 detectProfile ~60行） | ★★★★ 中期推荐 |
| **C. 决策树** | 用特征树代替线性链，每层按最强特征分流 | 可读性好 | 高（需重新设计判定逻辑） | ★★ 过度设计 |
| **D. 机器学习分类** | 训练分类器 | 自适应 | 极高（需数据集+训练+推理） | ★ 不适合本项目 |

**推荐 A→B 渐进路线**：先做 A 立即修复 bug，然后在模板数达 22 套时做 B 彻底重构。

---

## 四、测试架构评审

### 4.1 测试策略总览

| 测试文件 | 行数 | 断言数 | 覆盖内容 |
|----------|------|--------|----------|
| smoke.test.mjs | 117 | ~45 | 文件存在性、函数签名、副本一致性、噪音列表一致性 |
| logic.test.mjs | 711 | ~260 | 模板识别、类型识别、阶段链、产物清单、advice、边界、导出、鲁棒性 |
| scanner.test.mjs | 121 | ~25 | Electron 扫描、深度限制、大文件跳过、双路线等价 |
| **合计** | **949** | **~330** | 实测通过 302 项，失败 6 项 |

### 4.2 vm 加载策略评价

`_harness.mjs` 用正则 `/<script>([\s\S]*?)<\/script>/` 抽取脚本块，在 `vm.createContext` 中伪造 `document`/`window` 执行，再通过 `window.__PA` 拿到暴露的 API 做断言。

**优点：**
- 测试的是真实执行逻辑，不是源码字符串匹配
- 伪造的 document 足够简单，不需要 jsdom 等重依赖
- `__PA` 暴露了 30+ 内部函数，测试粒度细

**风险：**
- 伪造的 document 只有 `getElementById` 和 `createElement`，**任何使用其他 DOM API 的代码在测试中静默失败**（如 `querySelector`、`classList` 等）
- 正则 `/<script>([\s\S]*?)<\/script>/` 用非贪婪匹配，**如果 HTML 中有多个 `<script>` 块或字符串中包含 `</script>`，抽取会出错**
- vm 上下文没有 `Promise`/`fetch`/`FileReader` 等，异步代码的测试依赖 `__PA.analyze` 返回 Promise 在 Node 上下文中可用

### 4.3 正则提前闭合 Bug 的防御

已知问题：PROFILES 中的正则如 `docs\//` 会让正则字面量被提前闭合，后半段变成 JS 代码。`node --check` 查不出（因为整体语法仍合法），只有 vm 加载执行时才暴露（已踩过 3 次）。

**当前防御机制：**
- vm 加载执行（能发现运行时错误）
- 测试覆盖（如果提前闭合导致函数行为变化，测试会报）

**不足：**
- 如果提前闭合恰好不改变行为（如闭合后变成合法的 JS 表达式），测试也查不出
- 没有源码级的正则校验

**建议的源头防御：**
- 在 PROFILES 定义后加一段自检代码：遍历所有 phases/artifacts 的 `re` 字段，确认它们是 `RegExp` 实例（提前闭合会导致 `re` 变成字符串或其他类型）
- 或在 smoke.test.mjs 中通过 `__PA.PROFILES` 遍历所有 `re`/`tre` 字段，断言 `instanceof RegExp`

### 4.4 变异验证评价

README 提到"故意改坏 5 处判定逻辑，5 个全被抓到"。这是一种有效的测试有效性验证方法，但存在局限：

- 变异是手工的、一次性的，没有自动化变异测试框架
- 5 处变异覆盖面有限（18 个模板 × 多个判定分支）
- 没有对 advice 函数做变异验证（advice 逻辑的错误不会导致模板识别失败，但会导致建议内容错误）

### 4.5 fixture 覆盖度评价

logic.test.mjs 为 18 套模板各造了 1 个 fixture，共 18 个假项目。还有额外的边界 fixture（非法 JSON、中文路径、二进制文件、空项目、全噪音目录等）。

**覆盖盲区：**
- 每套模板只有 1 个"典型"fixture，**没有反例 fixture**（如"一个有 .tf 文件但不是 IaC 项目的目录"）
- **没有多模板混合 fixture**（如一个 monorepo 里同时有 server 和 web 两个子项目，且整体被判成某个模板）
- desktop 和 devops 的 fixture 暴露了真实 bug，说明 fixture 质量好，但也说明 fixture 与判定逻辑之间存在设计偏差

---

## 五、技术债清单

按严重度从高到低排序：

| # | 严重度 | 技术债 | 影响 | 重构方向 | 工作量 |
|---|--------|--------|------|----------|--------|
| 1 | **P0** | detectProfile 分支顺序导致 desktop→mini、devops→tool 误判 | 2 类项目分析结果错误 | 将 score 判定移到 mini/tool 启发式之前 | 0.5h |
| 2 | **P0** | Electron 副本未同步（差 19KB），CI 未阻断 | 打包出旧版 exe | npm test 前自动 sync，或加 pre-commit hook | 0.5h |
| 3 | **P1** | 18 套模板的 score/advice/PHASE_FILE 散落在 2454 行单文件中，新增模板需改 8 处 | 扩展成本高、易遗漏 | 模板数据驱动化（JSON 配置 + 通用引擎） | 2-3d |
| 4 | **P1** | detectProfile 的 if-else 顺序链，18 个分支顺序敏感 | 顺序错误即误判，且难以测试所有排列 | 改为打分排序取最高（方案 B） | 1d |
| 5 | **P1** | score 函数无正则集中管理，提前闭合 bug 已踩 3 次 | 正则字面量错误导致运行时异常 | 正则集中到单独对象 + instanceof RegExp 自检 | 0.5d |
| 6 | **P2** | smoke.test.mjs 的模板列表只有 7 套旧模板（game/web/lib/mini/tool/meta/generic），未更新到 18 套 | 新增的 11 套模板无 smoke 级存在性校验 | 从 `__PA.PROFILE_ORDER` 动态读取，不硬编码 | 0.5h |
| 7 | **P2** | 噪音列表 NOISE 在 html 和 scanner.js 各硬编码一份，靠 smoke.test 比对一致性 | 改一处忘改另一处导致双路线结果不一致 | 提取到独立 JSON 文件，两边引用 | 0.5d |
| 8 | **P2** | genIntro 的文档解析逻辑（按行扫描 Markdown）无独立测试 | README 格式变化可能导致 intro 提取异常 | 补 genIntro 的专项 fixture | 0.5d |
| 9 | **P3** | var 声明 + ES5 语法（为兼容性），但测试只在 Node 22 跑 | 代码风格陈旧，但不影响功能 | 可逐步改 let/const/箭头函数，但需确认浏览器兼容 | 1d |
| 10 | **P3** | 渲染层用字符串拼接 HTML（renderCard 等），无 XSS 转义审计 | esc() 函数已覆盖主要输出点，但需审计所有 innerHTML 赋值 | 全面审计 innerHTML 赋值点 | 0.5d |
| 11 | **P3** | 无集成测试覆盖 Electron 主进程 IPC（dialog:openFolder / fs:scan） | IPC 通道变更不会被测试发现 | 补 Electron IPC 的 mock 测试 | 1d |

---

## 六、改进建议

### 建议 1：立即修复 detectProfile 分支顺序（P0，0.5h）

将 `detectProfile` 中所有 `*Score >= 3` 的判定分支移到 mini 和 tool 的启发式判定之前。具体操作：

```
当前顺序: game → meta → mini(启发式) → iac → embedded → ... → desktop → ... → server → cli → tool(启发式) → lib → web → devops → ...
修正顺序: game → meta → iac → embedded → extension → data → mobile → desktop → aiml → microservice → server → cli → devops → mini(启发式) → tool(启发式) → lib → web → generic
```

将 mini 和 tool 的启发式判定移到所有 score 判定之后，作为 score 未命中时的兜底。这能立即修复 desktop→mini 和 devops→tool 两个 bug。

**收益**：修复 2 个已知误判 bug。  
**成本**：移动几行代码，调整测试 fixture 预期。

### 建议 2：同步自动化（P0，0.5h）

修改 `package.json` 的 test 脚本：

```json
"test": "npm run sync && node tests/smoke.test.mjs && node tests/logic.test.mjs && node tests/scanner.test.mjs"
```

或添加 pre-commit hook（`.husky/pre-commit` 或 `.git/hooks/pre-commit`）自动执行 sync。

**收益**：彻底消除"忘了同步"问题。  
**成本**：改一行脚本。

### 建议 3：判定流程重构为打分排序（P1，1d）

将 `detectProfile` 从 if-else 链改为：

```javascript
function detectProfile(paths, texts, type) {
  // 特殊类型直接返回
  if (/Godot|LÖVE|Unity|Unreal|游戏/i.test(type)) return "game";
  if (isMetaProject(paths)) return "meta";
  
  // 计算所有模板的 score
  var scores = PROFILE_ORDER.map(function(id) {
    var fn = SCORE_FUNCS[id];
    return { id: id, score: fn ? fn(paths, texts) : 0 };
  }).filter(function(s) { return s.score >= 3; });
  
  // 按分数降序，平局按 PRIORITY 表
  scores.sort(function(a, b) {
    return b.score - a.score || PRIORITY[a.id] - PRIORITY[b.id];
  });
  
  if (scores.length) return scores[0].id;
  
  // score 全未命中 → 启发式兜底
  return heuristicFallback(paths, texts, type);
}
```

**收益**：消除顺序依赖，新增模板只需注册 score 函数 + 优先级，无需在 if-else 链中找插入位置。  
**成本**：重构 detectProfile ~60 行 + 调整测试 + 验证所有 fixture 仍判对。

### 建议 4：模板数据驱动化（P1，2-3d）

将 PROFILES 的 phases/artifacts（已是数据）和 PHASE_FILE（已是数据）合并为 JSON 配置文件，将 advice 函数的 `if (!hasA.XXX)` 模式抽象为配置：

```json
{
  "id": "game",
  "name": "游戏项目",
  "phases": [...],
  "artifacts": [...],
  "phaseFile": {...},
  "adviceRules": [
    { "when": "!hasA.DOC", "pri": "P0", "tag": "基础", "title": "补 README", "detail": "...", "why": "..." },
    { "when": "!hasA.GDD", "pri": "P1", "tag": "设计", "title": "写 GDD", "detail": "...", "why": "..." }
  ]
}
```

通用 advice 引擎遍历 `adviceRules`，用 `new Function('hasA', 'd', 'return ' + rule.when)` 求值条件。

**收益**：新增模板从改 8 处代码降为加 1 个 JSON 配置 + 1 个 score 函数。  
**成本**：设计引擎 + 迁移 18 套模板 + 验证。  
**注意**：`new Function` 在浏览器 file:// 下可用，但需注意 CSP。

### 建议 5：正则集中管理 + 自检（P1，0.5d）

将 PROFILES 中所有 `re`/`tre` 正则提取到独立的 `REGEX` 对象中，并在脚本加载末尾添加自检：

```javascript
// 自检：所有 phases/artifacts 的 re/tre 必须是 RegExp 实例
// 如果正则被提前闭合，re 会变成字符串或其他类型
Object.keys(PROFILES).forEach(function(id) {
  var p = PROFILES[id];
  p.phases.forEach(function(ph, i) {
    if (ph.re && !(ph.re instanceof RegExp))
      throw new Error(id + ".phases[" + i + "].re 不是 RegExp（可能被提前闭合）");
  });
  p.artifacts.forEach(function(a, i) {
    if (a.re && !(a.re instanceof RegExp))
      throw new Error(id + ".artifacts[" + i + "].re 不是 RegExp");
  });
});
```

**收益**：正则提前闭合 bug 在加载时即报错，不需等 vm 执行。  
**成本**：提取正则到独立对象 + 加自检代码。

---

## 附录：关键数字

| 指标 | 数值 |
|------|------|
| 主文件行数 | 2,454 行 |
| 主文件大小 | 131 KB (111,387 字节) |
| `<script>` 块行数 | ~2,290 行 |
| 模板数量 | 18 套 |
| PROFILES 对象行数 | 423 行 (188-611) |
| score 函数数量 | 13 个 |
| advice 函数数量 | 18 个 |
| PHASE_FILE 变量数量 | 18 个 |
| detectProfile if-else 分支数 | 18 个 |
| 测试文件总行数 | 949 行 |
| 测试断言总数 | ~330 项 |
| 测试通过 / 失败 | 302 / 6 |
| 噪音目录数量 | 28 个 |
| `window.__PA` 暴露函数数 | 30+ |
| 新增模板需修改位置数 | 8 处 |
| 预计可承载模板上限 | ~24 套（再增 5-6 套） |
| 建议拆分文件的行数阈值 | ~3,000 行 |

---

*报告完。如需对任一建议展开详细设计，请随时指派。*
