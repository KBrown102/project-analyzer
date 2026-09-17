# 代码质量评审报告 · 项目结构分析器-1.0.0

> 评审人：严过关（QA 工程师）　　日期：2026-09-03　　路径：`project-analyzer.html` + `tests/`

---

## 结论先行

**当前测试套件存在 6 项失败，暴露 3 个真实源码 bug。** 代码功能完整、测试纪律在同类单文件工具中已属上乘，但 **18 套模板的高度重复（score × 11 / advice × 18 / PHASE_FILE × 16 / PROFILES × 18）构成最大技术债**，直接导致：新增模板时容易遗漏同步（副本漂移 19416 字符）、detectProfile 分支顺序错误难以发现（desktop 被吞为 mini、devops 被吞为 tool）。建议优先修复 3 个 bug，再启动数据驱动重构。

### 评分总览

| 维度 | 评分 | 说明 |
|------|------|------|
| 可读性 | B | 命名一致、注释用心，但单文件 2454 行 + 长函数拉低分数 |
| 规范一致性 | B+ | 18 套模板模式统一，但 mini 用 `tre` 字段、其余用 `re` 是特例 |
| 复杂度 | C+ | detectProfile 15 个 return 分支、顺序敏感，改动风险高 |
| 重复代码 | C- | score/advice/PHASE_FILE/PROFILES 四重重复，去重可减 ~600 行 |
| 测试覆盖 | B | 263+ 逻辑断言覆盖面广，但 smoke 过时、fixture 漏边界、变异验证缺位 |
| 潜在 bug | C | 3 个活跃 bug（desktop/devops 误判 + 副本漂移）+ 多处顺序依赖隐患 |

---

## 一、可读性

### 1.1 命名规范（良好）

- **score 函数**：`iacScore` / `embeddedScore` / `extensionScore` / `dataScore` / `cliScore` / `mobileScore` / `desktopScore` / `aimlScore` / `devopsScore` / `microserviceScore` / `serverScore` — 11 个函数命名模式统一（`<type>Score`），一眼可辨。
- **advice 函数**：`adviceGame` / `adviceWeb` / ... / `adviceDevops` — 18 个函数命名统一（`advice<Type>`）。
- **PHASE_FILE 表**：`GAME_PHASE_FILE` / `WEB_PHASE_FILE` / ... — 16 个表命名统一（`<TYPE>_PHASE_FILE`）。注意：`MINI_PHASE_FILE` 和 `TOOL_PHASE_FILE` 在 advice 函数前面定义，其余在 PROFILES 后集中定义，**位置不统一**。
- **PROFILES key**：全小写，与 `PROFILE_ORDER` 数组对齐，OK。

### 1.2 命名不一致点

| 位置 | 问题 | 影响 |
|------|------|------|
| `mini` 模板 phases/artifacts | 用 `tre` 字段（text regex）而非 `re` | 其他模板统一用 `re`（路径正则），mini 独用 `tre`（内容正则），`detectPhases` / `detectArtifacts` 里需同时处理两种字段名，增加认知负担 |
| `adviceTool` | 无 `phaseGap` 调用 | 18 个 advice 函数中唯一不调 `phaseGap` 的，但 `TOOL_PHASE_FILE` 表也没定义（tool 模板的 phases 里也没有产物文件映射），属于刻意省略但无注释说明 |
| `adviceGeneric` | 同样无 `phaseGap` | 同上 |

### 1.3 函数职责（中等）

- **职责单一的函数**：`anyPath` / `countPath` / `anyText` / `sortAdv` / `esc` / `topExt` / `scoreDir` — 这些小工具函数干净利落，单一职责。
- **职责过重的函数**：
  - `detectProfile`（L848-930，82 行，15 个 return）—— 既做模板匹配又做 fallback 兜底，分支顺序隐含业务优先级但无文档。
  - `detectType`（L620-665，46 行，15 if / 16 return）—— 同上，类型识别和 fallback 混在一起。
  - `buildData`（L1147-1189，43 行）—— 数据组装 + 调用 6 个 detect 函数 + 构建 has 映射，职责偏多但尚可接受。
  - `genIntro`（L1217-1293，77 行）—— 文档解析 + 技术栈推断 + 无文档时的 fallback 推断，三件事揉在一起。

### 1.4 注释质量（良好）

- 关键决策点有注释：`NOISE` 两处同步提醒（L165-167）、`serverScore` 的前后端区分说明（L668-669）、`detectProfile` 的顺序依赖说明（L871、L889-891、L922）。
- 但 **score 函数内部缺逐条注释**——例如 `serverScore` 里 `s += 3` 为什么是 3 分而不是 2 分，没有说明权重依据。
- `detectProfile` 的分支顺序是核心业务逻辑，但只有零星注释（"先认"/"排在前面"），**缺少一张完整的优先级表**。

---

## 二、规范一致性

### 2.1 18 套 PROFILES 写法（统一度高）

每套 PROFILES 遵循固定结构：`{ id, name, tag, phases:[{id,name,re}], artifacts:[{key,label,re}], advice }`。抽查 18 套，结构一致。

**特例**：
- `mini` 模板的 phases 和 artifacts 使用 `tre` 字段（内容正则），其余 17 套只用 `re`（路径正则）。
- `mini` 模板的 `SELF` artifact 使用 `neg: true`（反向匹配：命中 = 缺失），其余模板无 `neg` 项。
- `extension` 模板的 `manifest.json` 检测在 `extensionScore` 里读内容判断 `manifest_version`，而 PROFILES.artifacts 里只做路径匹配，**两层逻辑不一致**。

### 2.2 正则风格（基本统一，有细微差异）

- 大部分正则用 `/.../i`（忽略大小写），OK。
- 路径匹配统一用 `(^|\/)` 前缀 + `(\/|$)` 或 `\/` 后缀，OK。
- **不一致**：部分正则用 `\.` 转义点号（如 `\.tf$`），部分未转义（如 `manifest.json$`，`.` 匹配任意字符，虽然实际不影响结果但风格不统一）。
- **已知坑确认**：扫描全部正则字面量，**当前代码中无提前闭合风险**（0 个未转义 `/` 在正则内容中）。但历史上踩过 3 次，说明缺乏自动化守护——建议加一条 ESLint 规则或测试断言。

### 2.3 副本同步机制（存在漂移）

- `scripts/sync-electron.mjs` 负责把根文件复制到 `build-electron/`。
- `tests/logic.test.mjs` [12] 断言两份一致。
- **当前状态：副本落后 19416 字符**（根 111387 vs 副本 91971），说明改了根文件但没跑 `npm run sync`。这是一个 **活跃 bug**。

---

## 三、复杂度热点（Top 5）

| 排名 | 函数/区块 | HTML 行号 | 行数 | 圈复杂度 | 问题描述 |
|------|----------|-----------|------|----------|----------|
| 1 | `detectProfile` | L848-930 | 82 | ~15 | 15 个 return 分支，顺序敏感（改一个 if 位置可能导致一类项目被误判），无优先级文档 |
| 2 | `detectType` | L620-665 | 46 | ~16 | 15 if / 16 return，嵌套三元表达式（L643），fallback 链长 |
| 3 | `PROFILES` 定义 | L188-611 | 424 | — | 18 套模板数据挤在一个对象字面量里，改一个模板要在 424 行里找位置 |
| 4 | 18 个 advice 函数 | L1456-1907 | 428 | 各 ~5-8 | 每个 advice 函数 16-42 行，模式高度相似（phaseGap + hasA 检查 + push），但逐个手写 |
| 5 | `genIntro` | L1217-1293 | 77 | ~10 | 文档解析 + 技术栈推断 + fallback 推断三合一，嵌套循环 + 正则 + JSON.parse |

### 降复杂度建议

1. **detectProfile → 表驱动**：将 15 个分支抽象为有序规则表 `[{test: fn, profile: string, reason: string}]`，循环执行。每个规则独立可测，新增模板只需加一行。
2. **detectType → 同上**：将 if-else 链拆成有序规则表。
3. **genIntro → 拆三个函数**：`extractDocIntro` / `inferTechStack` / `inferFromPkgOrHtml`。
4. **advice → 数据驱动**：每套模板的 advice 规则用配置表描述（`{when: "!hasA.X", pri, tag, title, detail, why}`），通用引擎遍历产出。

---

## 四、重复代码（坏味道）

### 4.1 重复度量化

| 重复单元 | 数量 | 总行数 | 平均行数 | 重复模式 |
|----------|------|--------|----------|----------|
| score 函数 | 11 | 138 | 12.5 | `var s=0; if(anyPath(...)) s+=N; ... return s;` |
| advice 函数 | 18 | 428 | 23.8 | `var adv=[],hasA=d.has; phaseGap(...); if(!hasA.X) adv.push({...}); ... return sortAdv(adv);` |
| PHASE_FILE 表 | 16 | ~140 | ~8.8 | `var X_PHASE_FILE = { 0:"...", 1:"...", ... };` |
| PROFILES 定义 | 18 | 424 | ~23.6 | `{ id, name, tag, phases:[...], artifacts:[...], advice }` |
| **合计** | — | **~1130** | — | 占脚本总量 2291 行的 **49%** |

### 4.2 去重估算

| 重构项 | 当前行数 | 去重后行数 | 减少行数 | 方法 |
|--------|----------|------------|----------|------|
| score 函数 → 通用 `scoreByRules(paths, texts, rules)` | 138 | ~40（规则表）+ 15（引擎）= 55 | **83** | 每个 score 函数变成规则数组 `[{re, pts}]`，通用函数遍历打分 |
| advice 函数 → 通用 `genAdvice(d, rules)` | 428 | ~180（规则表）+ 25（引擎）= 205 | **223** | 每套模板的 advice 规则用 `{when, pri, tag, title, detail, why}` 描述，通用引擎遍历 |
| PHASE_FILE → 合入 PROFILES | 140 | 0（内联到 PROFILES） | **140** | `PROFILES.x.phases[i].file = "..."` 直接写在 phase 定义里 |
| detectProfile → 规则表 | 82 | ~35（规则表）+ 10（引擎）= 45 | **37** | 有序规则表 `[{test, profile, reason}]` |
| **合计可减少** | — | — | **~483 行** | 去重后脚本从 2291 行降至 ~1808 行（-21%） |

### 4.3 具体重复示例

**score 函数重复模式**（以 `iacScore` 和 `embeddedScore` 为例）：
```javascript
// iacScore (9行)                    // embeddedScore (10行)
var s = 0;                            var s = 0;
if (anyPath(paths, /\.tf$/i)) s+=3;   if (anyPath(paths, /CMakeLists.../)) s+=2;
if (anyPath(paths, /(^|\/)modules.../)) s+=2;  if (anyPath(paths, /(^|\/)(hal|bsp.../)) s+=2;
if (anyPath(paths, /\.tfvars$/i)) s+=1;  if (anyPath(paths, /\.ld$|\.sct$/i)) s+=2;
...                                   ...
return s;                             return s;
```
→ 可抽象为 `scoreByRules(paths, [{re:/\.tf$/i, pts:3}, {re:/(^|\/)modules.../i, pts:2}, ...])`

**advice 函数重复模式**（以 `adviceIac` 和 `adviceEmbedded` 为例）：
```javascript
// adviceIac (23行)                  // adviceEmbedded (23行)
var adv = [], hasA = d.has;           var adv = [], hasA = d.has;
phaseGap(d, adv, 5, IAC_PHASE_FILE, ...);  phaseGap(d, adv, 5, EMBEDDED_PHASE_FILE, ...);
if (!hasA.README) adv.push({pri:"P0", ...});  if (!hasA.README) adv.push({pri:"P0", ...});
if (!hasA.MODULES) adv.push({pri:"P1", ...});  if (!hasA.LAYER) adv.push({pri:"P1", ...});
...                                   ...
return sortAdv(adv);                  return sortAdv(adv);
```
→ 可抽象为规则表 `[{when:"!hasA.README", pri:"P0", tag:"基础", title:"补 README", detail:"...", why:"..."}]`

---

## 五、测试覆盖度

### 5.1 测试套件概况

| 文件 | 断言数 | 覆盖范围 |
|------|--------|----------|
| `logic.test.mjs` | 302 通过 / 6 失败 | 模板识别 × 18、类型识别、阶段链、产物清单、advice 输出、NOISE 过滤、工程化指标、鲁棒性、交叉跑通、边界识别、子项目切换、提示词导出、API 契约 |
| `smoke.test.mjs` | ~50 | 文件存在性、函数定义、打包资产、NOISE 一致性 |
| `scanner.test.mjs` | 25 | Electron 扫描、深度限制、噪音过滤、两路线一致性 |
| `_harness.mjs` | — | vm 加载器、假文件工厂、断言器 |

### 5.2 测试优点

- **vm 真实执行**：不是对源码字符串做正则，而是把 `<script>` 抽出来在 Node vm 里跑，喂假目录断言真实行为——这是同类工具中难得的测试纪律。
- **18 × 18 交叉跑通**：`[11]` 把每个 fixture × 每个模板组合跑一遍，确保换模板不会炸。
- **对照组思维**：`[2b]` 测后端识别时同时放 React 前端 / npm 库做对照组，验证不误判。
- **边界行为钉住**：`[8]` 顶层目录名撞噪音词时整棵被过滤——不断言"应该"而是"钉住当前行为"，改正则时测试会提醒复查。
- **neg 语义验证**：`[5b]` 遍历所有模板的 `neg` 项，验证 `has === !evidence`。

### 5.3 测试覆盖缺口

| 缺口 | 严重度 | 说明 |
|------|--------|------|
| **smoke test 过时** | 高 | `smoke.test.mjs` L35 只检查 7 个 profile（game/web/lib/mini/tool/meta/generic），**漏检 11 个**（server/iac/embedded/extension/data/cli/mobile/desktop/aiml/devops/microservice）。同样 L40-43 只检查 7 个 advice 函数。新增模板时 smoke test 不会提醒补检。 |
| **fixture 未覆盖真实复杂度** | 中 | 所有 fixture 都是"干净"的最小项目（5-10 个文件）。真实项目有 node_modules、.git、多语言、嵌套工作区、超大文件等噪音，fixture 未模拟。 |
| **score 函数互吞未测** | 中 | 无测试验证"同一项目同时命中两个 score ≥ 3 时，detectProfile 选了正确的那个"。例如：一个同时有 Dockerfile + k8s/ + routes/ 的项目，server 和 devops 都可能 ≥ 3，但无测试验证选了哪个。 |
| **detectProfile 顺序变更无守护** | 中 | 无测试验证"调换两个 if 位置后结果不变"。当前 desktop 被 mini 吞、devops 被 tool 吞就是顺序错误，但测试只验证了"fixture X 应判为 Y"，没有验证"不该判为 Z"。 |
| **变异验证缺位** | 低 | 无变异测试（如：把某个 `s += 3` 改成 `s += 2`，测试是否会发现）。不过对于手动测试套件，这一项属于 nice-to-have。 |
| **正则提前闭合无自动化守护** | 中 | 已知踩过 3 次的坑，但无自动化测试验证"所有正则字面量都能正确编译且不提前闭合"。建议加一条测试：`eval` 每个正则并断言其 `source` 与源码一致。 |
| **并发/性能无测试** | 低 | `readTexts` 用 Promise 链式串行读文件（L1082-1088），大目录时慢。无性能测试。 |
| **副本同步只检查字节一致** | 低 | `[12]` 检查 `a === b`，但不检查"副本是否落后于根"——当前就处于落后状态。建议在 CI 里加 `npm run sync` + git diff 检查。 |

---

## 六、潜在 Bug 清单

### 6.1 活跃 Bug（测试已暴露）

| # | Bug | 根因 | 位置 | 影响 |
|---|-----|------|------|------|
| **B1** | Desktop fixture 被误判为 `mini` | `detectProfile` L861 的 mini 检查（`paths.length <= 14 && noDesign && index.html`）在 L883 的 `desktopScore` 之前执行，Electron 桌面应用有 renderer/index.html 且文件数少时被 mini 吞 | L861-868 vs L883 | Electron 桌面应用被判为小游戏，阶段/产物/建议全错 |
| **B2** | DevOps fixture 被误判为 `tool` | `detectProfile` L899 的 tool 检查（`paths.length <= 12 && srcR < 0.5 && mdN < 8`）在 L923 的 `devopsScore` 之前执行，DevOps 仓库文件少且无源码时被 tool 吞 | L899 vs L923 | DevOps 仓库被判为内部工具，阶段/产物/建议全错 |
| **B3** | 副本未同步 | 根文件更新后未执行 `npm run sync` | `build-electron/project-analyzer.html` | Electron 打包版装的是旧分析器（缺 desktop/devops 等 11 个模板），落后 19416 字符 |

### 6.2 潜在 Bug（未触发但存在风险）

| # | 风险 | 说明 | 触发条件 |
|---|------|------|----------|
| **P1** | score 函数互吞 | `serverScore` 和 `microserviceScore` 都匹配 `services/`；`serverScore` 和 `devopsScore` 都匹配 `Dockerfile`；`cliScore` 和 `devopsScore` 都匹配 `scripts/`、`bin/`。当一个项目同时命中两个 score ≥ 3 时，结果取决于 detectProfile 中的 if 顺序，而非业务优先级 | 一个同时有 Express routes + Dockerfile + k8s/ 的全栈项目 |
| **P2** | detectProfile 顺序依赖无文档 | 15 个 return 分支的顺序本身就是业务逻辑（"iac 先认避免被 server 吞"），但只有零星注释。新增模板时如果插错位置，会导致其他模板被吞 | 新增第 19 个模板时 |
| **P3** | `manifest.json` 歧义 | `extensionScore` 检查 `manifest.json` 内容判断是否为 MV3 插件，但 `desktopScore` 不检查。一个 Electron 桌面应用如果有 `manifest.json`（非 MV3），可能被 extensionScore 抢走 | Electron 应用意外有 manifest.json |
| **P4** | NOISE 正则顶层目录吞没 | 已知行为（`[8]` 钉住）：顶层目录名叫 `dist` / `build` / `bin` 时整棵树被过滤返回 null。虽然测试钉住了，但用户如果项目目录就叫这些名字，会得到"没有可分析的文件"的困惑提示 | 用户选的根目录名恰好是噪音词 |
| **P5** | `readTexts` 串行 Promise 链 | L1082-1088 用 `reduce` 串行读文件，250 个文件时逐个 await，大目录下可能卡顿。Electron 版 scanner.js 已经用了 `fsp` 但仍是串行 for 循环 | 选了有 200+ 文本文件的大目录 |
| **P6** | `renderCompare` 假设同模板 | L2127-2134 遍历 `getProfile(a.profile).artifacts` 并用索引 `i` 访问 `b.artifacts[i]`，如果 A/B 模板不同会越界。虽然 L2202 强制 B 用 A 的模板，但 `buildData` 返回的 artifacts 数组长度取决于模板，如果强制失败则越界 | 对比模式下两项目模板不同且强制失败 |
| **P7** | 正则提前闭合无自动化守护 | 已知踩过 3 次。当前代码安全（0 个未转义 `/`），但无 CI 检查。加正则时可能再次踩坑 | 未来新增包含 `/` 的正则时 |

---

## 七、重构建议（按优先级排序）

### P0：修复 3 个活跃 Bug（立即）

| # | 动作 | 预期收益 |
|---|------|----------|
| 1 | **修复 desktop 被吞为 mini**：在 L861 的 mini 检查前加 `desktopScore(paths, texts) >= 3` 前置检查，或将 mini 检查移到所有 score 检查之后 | 修复 1 个模板误判，6 项测试失败减至 4 项 |
| 2 | **修复 devops 被吞为 tool**：将 L923 的 `devopsScore` 检查移到 L899 的 tool 检查之前 | 修复 1 个模板误判，6 项测试失败减至 2 项 |
| 3 | **执行 `npm run sync` 同步副本** | 修复打包版使用旧分析器的问题，6 项测试失败归零 |

### P1：补全 smoke test + 加正则守护（1 天）

| # | 动作 | 预期收益 |
|---|------|----------|
| 4 | **smoke test 补全 18 套模板**：把 L35 的 profiles 数组和 L40-43 的 advises 数组更新为 18 项 | 新增模板时 smoke test 会提醒补检 |
| 5 | **加正则提前闭合守护测试**：遍历所有正则字面量，`eval` 后断言 `source` 与源码一致，且不产生 `SyntaxError` | 杜绝已踩 3 次的坑再次发生 |
| 6 | **加 detectProfile 顺序守护测试**：为每个 fixture 增加"不应被判为 Z"的负向断言 | 防止调换分支顺序导致互吞 |

### P2：数据驱动重构（3-5 天）

| # | 动作 | 预期收益 |
|---|------|----------|
| 7 | **score 函数 → 规则表 + 通用引擎**：11 个 score 函数（138 行）抽象为 `scoreByRules(paths, texts, rules)` + 11 套规则表（~55 行） | 减 83 行，新增模板只需加规则表，不用写函数 |
| 8 | **advice 函数 → 规则表 + 通用引擎**：18 个 advice 函数（428 行）抽象为 `genAdvice(d, rules)` + 18 套规则表（~205 行） | 减 223 行，advice 规则集中可审查 |
| 9 | **PHASE_FILE 内联到 PROFILES**：16 个 PHASE_FILE 表（~140 行）合并到 `PROFILES.x.phases[i].file` | 减 140 行，消除"改 PROFILES 忘改 PHASE_FILE"风险 |
| 10 | **detectProfile → 有序规则表**：82 行 if-else 链抽象为 `[{test, profile, reason}]` 规则表 + 10 行引擎 | 减 37 行，分支顺序可一眼审查，新增模板加一行 |

### P3：长函数拆分（1-2 天）

| # | 动作 | 预期收益 |
|---|------|----------|
| 11 | **genIntro 拆三函数**：`extractDocIntro` / `inferTechStack` / `inferFromPkgOrHtml` | 77 行函数拆成 3 个 25 行函数，可独立测试 |
| 12 | **detectType → 规则表**：同 detectProfile | 降圈复杂度，类型识别规则可一眼审查 |

---

## 附录：测试运行结果

```
npm test 结果：
  logic.test.mjs:  通过 302 项，失败 6 项
  smoke.test.mjs:  全部通过（但覆盖不全）
  scanner.test.mjs: 全部通过

失败项：
  - desktop → profile (期望 desktop，实际 mini) — [B1]
  - devops → profile (期望 devops，实际 tool) — [B2]
  - 18 个 fixture 判出 18 种模板，无重复 — [B1][B2] 连带
  - 桌面 profile — [B1] 连带
  - DevOps profile — [B2] 连带
  - build-electron/project-analyzer.html 与根文件一致 — [B3]
```
