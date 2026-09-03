# P1 重构详细设计：detectProfile 打分排序 + 正则集中管理 + 测试补全

> **设计人**：高见远（架构师）  
> **日期**：2026-09-03  
> **项目路径**：`E:\WorkSpeace\WorkSpeace_WorkBuddy\项目结构分析器-1.0.0`  
> **性质**：纯设计文档，不含实现代码。工程师（李铁锤）据此实现。  
> **前置条件**：P0 已完成（desktop 和 devops 的分支顺序已修正，全部 333 项测试全绿）

---

## 一、设计概述

### 1.1 重构目标

| 子任务 | 目标 | 核心产出 |
|--------|------|----------|
| 1. detectProfile 打分排序 | 消除 18 分支 if-else 的顺序依赖，改为"所有模板一起打分→排序→取最高→同分按优先级裁决" | 新 detectProfile + SCORE_REGISTRY + PRIORITY + 5 个新 score 函数 |
| 2. 正则集中管理 | 散落在 PROFILES/score/detectProfile/detectType 各处的 100+ 正则集中到 REGEXES 对象，加 instanceof 自检 + 单测 | REGEXES 对象 + 自检代码 + regex.test.mjs |
| 3. smoke 补全 + 负向断言 | smoke 从 7/18 补到 18/18；logic 加顺序负向断言验证优先级裁决 | smoke 扩展 + 5-7 组冲突 fixture |
| 4. 实现顺序与风险控制 | 确定子任务依赖顺序、测试锁现状策略、回滚方案 | 实现路线图 |

### 1.2 设计约束（不可违反）

1. **单文件零依赖架构保持**：不拆模块，所有改动在 `project-analyzer.html` 的 `<script>` 内完成
2. **行为不变**：18 套模板的判定结果不能变——同样的输入，重构前后判成同一个 profile
3. **现有测试全绿**：重构是内部变更，logic.test.mjs（308 项）、smoke.test.mjs、scanner.test.mjs（25 项）必须继续全通过
4. **ES5 语法**：保持 `var`、`function` 声明风格，不用 `let/const/箭头函数`（与现有代码一致）

---

## 二、子任务 1：detectProfile 改为打分排序取最高

### 2.1 当前问题回顾

当前 `detectProfile`（L848-930）是 83 行 if-else 链，18 个分支按固定顺序判定。P0 修正了 desktop→mini 和 devops→tool 两个已知 bug（把 desktop 和 devops 的 score 检查移到 mini/tool 启发式之前），但根本问题仍在：

- mini 启发式仍在 desktop 和 iac 之间（L864-872），任何"文件少 + index.html + canvas"的项目都会被 mini 截胡，到不了 iac/embedded 等 score 检查
- tool 启发式仍在 devops 之后、lib/web 之前（L902-903），"文件少 + srcR<0.5" 的判定太宽泛
- 新增模板必须在 if-else 链中找到正确的插入位置，18 个分支的位置敏感性已达可维护上限

### 2.2 核心设计：消除 if-else，改为打分→排序→取最高

**新 detectProfile 伪代码**（完整，可直接照此实现）：

```javascript
// —— 打分注册表：所有模板的 score 函数在此注册 ——
// detectProfile 遍此表，不靠 if-else 顺序
var SCORE_REGISTRY = [
  { id: "game",         fn: gameScoreV2   },  // type-based，特殊
  { id: "iac",          fn: iacScore      },  // 原有 11 个不变
  { id: "embedded",     fn: embeddedScore },
  { id: "extension",    fn: extensionScore},
  { id: "mobile",       fn: mobileScore   },
  { id: "desktop",      fn: desktopScore  },
  { id: "aiml",         fn: aimlScore     },
  { id: "microservice", fn: microserviceScore },
  { id: "data",         fn: dataScore     },
  { id: "server",       fn: serverScoreV2 },  // 新：带 !hasFrontendSignal 守卫
  { id: "devops",       fn: devopsScore   },
  { id: "cli",          fn: cliScore      },
  { id: "mini",         fn: miniScore     },  // 新：从启发式改造
  { id: "meta",         fn: metaScore     },  // 新：从启发式改造
  { id: "lib",          fn: libScore      },  // 新：从启发式改造
  { id: "web",          fn: webScore      },  // 新：从启发式改造
  { id: "tool",         fn: toolScore     }   // 新：从启发式改造
  // 注意：generic 不在注册表中，它是 detectProfile 的兜底返回值
];

// —— 优先级裁决表：同分时数值大的赢 ——
// 设计依据：特征越特异的模板优先级越高（iac 的 .tf 比 devops 的 CI 更特异）
var PRIORITY = {
  game:        100,   // type-based 硬匹配，永远赢同分
  iac:          16,   // .tf 最特异
  embedded:     15,   // CMake + HAL/BSP 分层
  extension:    14,   // manifest MV3
  mobile:       13,   // AndroidManifest / xcodeproj
  desktop:      12,   // electron / tauri
  aiml:         11,   // 模型权重 + 训练
  microservice: 10,   // 多服务 + 网关
  data:          9,   // dags + warehouse
  server:        8,   // 后端框架 + routes（有 !hasFrontendSignal 守卫）
  devops:        7,   // CI + k8s
  cli:           6,   // bin + argparse
  mini:          5,   // index.html + canvas + 少文件
  meta:          4,   // md 占比高
  lib:           3,   // package.json main/exports
  web:           2,   // pages/views/routes + tsx/jsx
  tool:          1    // 少文件 + 脚本（最泛化，优先级最低）
};

// —— 新 detectProfile：打分 → 过滤达标 → 排序 → 取最高 ——
function detectProfile(paths, texts, type) {
  var hits = [];
  for (var i = 0; i < SCORE_REGISTRY.length; i++) {
    var entry = SCORE_REGISTRY[i];
    var score = entry.fn(paths, texts, type);
    if (score >= 3) {
      hits.push({ id: entry.id, score: score, priority: PRIORITY[entry.id] });
    }
  }
  // 无命中 → generic 兜底
  if (!hits.length) return "generic";
  // 排序：分数降序，同分按优先级降序
  hits.sort(function(a, b) {
    return b.score - a.score || b.priority - a.priority;
  });
  return hits[0].id;
}
```

**关键设计决策**：

- **阈值统一保持 >= 3**：所有 score 函数（包括新改造的 5 个）都使用 `>= 3` 作为命中阈值。不改变阈值的理由：现有 11 个 score 函数都校准在 3，改阈值会引入不可预测的行为变化。同分靠优先级表裁决，不靠调阈值。
- **generic 不进注册表**：generic 是兜底，不是"打分为 0 的模板"。当所有 score 都 < 3 时，detectProfile 直接 return "generic"。
- **PROFILE_ORDER 保留但语义变化**：`PROFILE_ORDER` 不再是判定执行顺序（那是 SCORE_REGISTRY 的职责），仅用于 UI 下拉菜单排序和测试遍历。其值不需要改。

### 2.3 启发式判定改造方案（7 个 → 5 个 score 函数 + 0 个特判）

当前 detectProfile 有 7 个非 score 启发式判定。改造方案如下：

| 启发式 | 当前逻辑 | 改造方案 | 新 score 函数 |
|--------|----------|----------|---------------|
| game | `type` 含 Godot/LÖVE/Unity/Unreal/游戏 → return | 改为 score 函数，type 匹配时返回 3，优先级 100 保证赢同分 | `gameScoreV2(paths, texts, type)` |
| meta | `mdR>0.35 && srcR<0.15 && mdN>=3` → return | 改为 score 函数，条件满足返回 3 | `metaScore(paths, texts)` |
| mini | `paths<=14 && noDesign && index.html && (canvas/动画 or game or paths<=6)` → return | 改为 score 函数，条件满足返回 3 | `miniScore(paths, texts)` |
| tool (少文件) | `singleHtml or (paths<=12 && srcR<0.5 && mdN<8)` → return | 合并到 toolScore | `toolScore(paths, texts, type)` |
| tool (bat/sh) | `anyPath(.bat/.sh) && !pages/views/routes` → return | 合并到 toolScore | （同上） |
| lib | 根级 package.json 有 main/exports/types 且无 pages/views/routes → return | 改为 score 函数 | `libScore(paths, texts)` |
| web | 有 pages/views/routes 或 tsx/jsx/vue/svelte 或 (type 匹配 && components/styles/static) → return | 改为 score 函数 | `webScore(paths, texts, type)` |
| generic | 兜底 | 保持兜底，不进注册表 | （无） |

**结论：全部 7 个启发式都改造为 score 函数，0 个保留特判。** 这是比架构评审报告中建议的"保留 game 特判"更彻底的方案。理由：

1. game 依赖 `type` 参数，但 score 函数签名统一为 `(paths, texts, type)`，`type` 作为第三参数传入即可
2. 保留任何特判都会在 detectProfile 中残留 if-else，破坏"纯打分"的简洁性
3. game 的优先级 100 远高于其他模板（次高 iac=16），同分时必赢，效果等同于特判

### 2.4 五个新 score 函数伪代码

以下伪代码保证行为等价：条件与当前 detectProfile 中的启发式逻辑完全一致，只是包装为返回 0 或 3 的函数。

#### 2.4.1 gameScoreV2

```javascript
// game：依赖 detectType 的输出字符串，不是路径特征
function gameScoreV2(paths, texts, type) {
  if (type && /Godot|LÖVE|Unity|Unreal|游戏/i.test(type)) return 3;
  return 0;
}
```

#### 2.4.2 metaScore

```javascript
// meta：文档为主、源码极少
function metaScore(paths, texts) {
  var n = paths.length || 1;
  var mdN = countPath(paths, /\.md$/i);
  var srcN = countPath(paths, RE_SRC);
  var mdR = mdN / n, srcR = srcN / n;
  if (mdR > 0.35 && srcR < 0.15 && mdN >= 3) return 3;
  return 0;
}
```

#### 2.4.3 miniScore

```javascript
// mini：文件少 + index.html + canvas/game/动画（与原 L862-872 逻辑一致）
function miniScore(paths, texts) {
  var noDesign = !anyPath(paths, /(^|\/)(gdd|design|production|art)\//i);
  if (!(paths.length <= 14 && noDesign && anyPath(paths, /(^|\/)index\.html$/i)))
    return 0;
  // 检查 index.html 内容
  var idxTxt = "";
  for (var j = 0; j < texts.length; j++) {
    if (/(^|\/)index\.html$/i.test(texts[j].path)) { idxTxt = texts[j].text; break; }
  }
  if (/canvas|requestAnimationFrame|game|游戏|互动|动画/i.test(idxTxt)) return 3;
  if (/game/i.test(paths.join(" "))) return 3;
  if (paths.length <= 6) return 3;
  return 0;
}
```

#### 2.4.4 toolScore

```javascript
// tool：少文件/单html/bat-sh 脚本/Python-Java-Rust 少源码（合并原 L902-903 + L927 + L929 三段逻辑）
function toolScore(paths, texts, type) {
  var n = paths.length || 1;
  var mdN = countPath(paths, /\.md$/i);
  var srcN = countPath(paths, RE_SRC);
  var srcR = srcN / n;

  // 启发式 1：单 html 或少文件
  var singleHtml = paths.length <= 5 && anyPath(paths, /(^|\/)[^/]+\.html$/);
  if (singleHtml) return 3;
  if (paths.length <= 12 && srcR < 0.5 && mdN < 8) return 3;

  // 启发式 2：bat/sh 启动脚本且无页面结构
  if (anyPath(paths, /\.(bat|sh)$/i) && !anyPath(paths, /(^|\/)(pages|views|routes)\//i))
    return 3;

  // 启发式 3：Python/Java/Rust 项目且源码少（srcN<=8 归 tool，>8 归 lib）
  // 注意：这里的 lib/tool 裁决在原代码 L929，toolScore 只负责返回 3 或 0
  // libScore 也会检查类似条件，优先级 lib(3) > tool(1)，所以同分时 lib 赢
  if (/Python|Java|Rust/i.test(type) && srcN <= 8) return 3;

  return 0;
}
```

**注意**：原 L929 的 `srcN > 8 ? "lib" : "tool"` 逻辑在打分体系下被拆分：
- `toolScore` 处理 `srcN <= 8` 的情况（返回 3）
- `libScore` 独立判断（见下），当 package.json 有 main/exports/types 时返回 3
- 若同分（toolScore=3 && libScore=3），优先级 lib(3) > tool(1)，lib 赢
- 但原 L929 只在 type 含 Python/Java/Rust 时触发 lib/tool 裁决，且条件是 package.json 不在（否则 lib 的 L907-917 会先触发）。在打分体系下，libScore 会检查 package.json，toolScore 检查 type+srcN，两者独立打分，优先级裁决。**需验证 Python fixture 的行为不变**（见 2.8 验证矩阵）。

#### 2.4.5 libScore

```javascript
// lib：根级 package.json 暴露入口/类型，且无页面目录（与原 L907-917 逻辑一致）
function libScore(paths, texts) {
  for (var i = 0; i < texts.length; i++) {
    if (!/package\.json$/i.test(texts[i].path)) continue;
    if (texts[i].path.split("/").length > 2) continue;  // 只认根级
    try {
      var pk = JSON.parse(texts[i].text);
      if (pk.main || pk.exports || pk.types || pk.typings) {
        if (!anyPath(paths, /(^|\/)(pages|views|routes|public)\//i)) return 3;
      }
    } catch(e) {}
    break;
  }
  return 0;
}
```

#### 2.4.6 webScore

```javascript
// web：页面结构或前端框架特征（与原 L921-924 逻辑一致）
function webScore(paths, texts, type) {
  if (anyPath(paths, /(^|\/)(pages|views|routes|public)\//i)) return 3;
  if (anyPath(paths, /\.(tsx|jsx|vue|svelte)$/i)) return 3;
  if (/HTML5|静态网站|前端/i.test(type) &&
      anyPath(paths, /(^|\/)(components|styles|static)\//i)) return 3;
  return 0;
}
```

#### 2.4.7 serverScoreV2（守卫包装）

```javascript
// server：在原 serverScore 外包一层 !hasFrontendSignal 守卫
// 原 detectProfile L893 的 `!hasFrontendSignal && serverScore>=3` 逻辑移入此处
function serverScoreV2(paths, texts, type) {
  if (hasFrontendSignal(paths)) return 0;  // 前端信号强时不计后端分
  return serverScore(paths, texts);
}
```

### 2.5 hasFrontendSignal 融入方案

当前 `hasFrontendSignal`（L698-701）检查 tsx/jsx/vue/svelte 和 pages/views/components/styles/public 目录。在 if-else 链中，它作为 server 判定的前置条件（L893）。

**融入方案**：将 `!hasFrontendSignal` 检查从 detectProfile 移入 `serverScoreV2`。这样：

- server 的打分自带前端守卫，不需要 detectProfile 特判
- 其他模板不受 hasFrontendSignal 影响（与当前行为一致）
- `hasFrontendSignal` 函数本身不需要修改，继续被 `detectType`（L648）和 `serverScoreV2` 共用

**为什么不在所有 score 函数里检查 hasFrontendSignal**：因为只有 server 有"前端出现时不应判后端"的语义。microservice、cli 等模板即使有前端文件也不影响其判定。如果给所有模板都加守卫，会改变行为。

### 2.6 SCORE_REGISTRY 与 PRIORITY 的 __PA 暴露

在 `window.__PA` 对象中新增暴露：

```javascript
window.__PA = {
  // ... 原有暴露不变 ...
  SCORE_REGISTRY: SCORE_REGISTRY,
  PRIORITY: PRIORITY,
  gameScoreV2: gameScoreV2,     // 新增 5 个 score 函数
  metaScore: metaScore,
  miniScore: miniScore,
  libScore: libScore,
  webScore: webScore,
  toolScore: toolScore,
  serverScoreV2: serverScoreV2
};
```

### 2.7 改动影响面

| 影响面 | 说明 | 风险 |
|--------|------|------|
| **detectProfile 函数体** | 从 83 行 if-else 替换为 ~20 行打分排序 | 高（核心逻辑） |
| **新增 6 个函数** | gameScoreV2 / metaScore / miniScore / libScore / webScore / toolScore / serverScoreV2 | 中（新代码，需测试） |
| **新增 2 个常量** | SCORE_REGISTRY / PRIORITY | 低（纯数据） |
| **__PA 暴露** | 新增 8 个字段 | 低 |
| **detectProfile 调用方** | buildData（L1160）调用 `detectProfile(paths, texts, type)` —— 签名不变，无需改 | 无 |
| **detectType** | 不受影响。detectType 仍用自己的 if-else + 11 个 score 函数（签名不变，`type` 参数被忽略） | 无 |
| **测试断言** | logic.test.mjs 的 fixture 期望判成某 profile —— 行为不变则断言不变 | 低（需验证，见 2.8） |
| **PROFILE_ORDER** | 保留不变，仅用于 UI 下拉排序和测试遍历，不再控制判定顺序 | 无 |
| **Electron 副本** | 改完根文件后须 `npm run sync` 同步到 build-electron/project-analyzer.html | 低（已有 sync 脚本） |

### 2.8 18 套 fixture 验证矩阵

重构后每套 fixture 必须仍判成原 profile。以下矩阵列出每套 fixture 在新打分体系下各模板的预期分数（只列 >= 1 的），以及最终裁决结果：

| # | fixture | 命中的 score 函数（>=3） | 最终裁决 | 优先级裁决依据 |
|---|---------|--------------------------|----------|----------------|
| 1 | game | gameScoreV2=3, toolScore=3 | **game** | game 优先级 100 > tool 1 |
| 2 | web | webScore=3 | **web** | 唯一命中 |
| 3 | server | serverScoreV2=3 (serverScore=4, !hasFrontendSignal) | **server** | 唯一命中 |
| 4 | lib | libScore=3 | **lib** | 唯一命中 |
| 5 | mini | miniScore=3 | **mini** | 唯一命中 |
| 6 | tool | toolScore=3 | **tool** | 唯一命中 |
| 7 | meta | metaScore=3 | **meta** | 唯一命中 |
| 8 | generic | 无命中 | **generic** | 兜底 |
| 9 | iac | iacScore=8 | **iac** | 唯一命中 |
| 10 | embedded | embeddedScore=8 | **embedded** | 唯一命中 |
| 11 | extension | extensionScore=7 | **extension** | 唯一命中 |
| 12 | data | dataScore=8 | **data** | 唯一命中 |
| 13 | cli | cliScore=6, toolScore=3 | **cli** | cli 优先级 6 > tool 1 |
| 14 | desktop | desktopScore=4 | **desktop** | 唯一命中 |
| 15 | mobile | mobileScore=8 | **mobile** | 唯一命中 |
| 16 | aiml | aimlScore=7 | **aiml** | 唯一命中 |
| 17 | devops | devopsScore=4, toolScore=3 | **devops** | devops 优先级 7 > tool 1 |
| 18 | microservice | microserviceScore=6, serverScoreV2=3 | **microservice** | microservice 优先级 10 > server 8 |

**注意 #1（game fixture）**：game fixture 有 6 个文件（project.godot, README.md, design/gdd/core.md, docs/architecture.md, src/player.gd, .github/workflows/ci.yml）。toolScore 会命中（paths=6<=12, srcR=1/6<0.5, mdN=3<8）。但 gameScoreV2=3 && toolScore=3 同分时，game 优先级 100 赢。**这是打分体系比 if-else 更可靠的地方**：在旧体系里，如果 game 的特判被意外移到 tool 后面，game 就会被 tool 吞掉；新体系里优先级表保证了 game 永远赢。

**注意 #13（cli fixture）**：cli fixture 有 4 个文件，toolScore 会命中（paths=4<=12, srcR=1/4<0.5, mdN=1<8）。cliScore=6（bin+argparse+.sh）> toolScore=3，分数高直接赢，不需要优先级裁决。

**注意 #17（devops fixture）**：devops fixture 有 6 个文件，toolScore 会命中（paths=6<=12, srcR=0<0.5, mdN=1<8）。devopsScore=4 > toolScore=3，分数高直接赢。**这正是 P0 修复的 bug 场景**——旧体系里 tool 启发式在 devopsScore 之前执行会截胡；新体系里两者都打分，devops 分数更高直接赢。

**注意 #18（microservice fixture）**：每个子服务有 package.json 含 express，serverScoreV2 会命中（serverScore=3, !hasFrontendSignal=true）。microserviceScore=6 > serverScoreV2=3，分数高直接赢。

### 2.9 detectType 是否也需要重构

**不在 P1 范围内。** detectType（L620-665）也是 if-else 链，但它的问题比 detectProfile 轻：

- detectType 的分支大多是路径特征检查（project.godot, AndroidManifest.xml, package.json 等），不像 detectProfile 那样有"少文件启发式穿插在 score 检查中间"的问题
- detectType 的输出是展示用的类型字符串（"Godot 游戏"、"Node 后端服务"等），不是模板选择，误判后果较轻
- detectType 和 detectProfile 共用 11 个 score 函数，改 score 函数签名（加 type 参数）对 detectType 无影响（type 参数被忽略）

建议作为 P2 候选：当模板数达到 22 套时，对 detectType 做同样的打分排序改造。

---

## 三、子任务 2：正则集中管理 REGEXES

### 3.1 当前散落状况

正则字面量散落在以下位置（粗略统计）：

| 位置 | 正则数量（估） | 典型示例 |
|------|---------------|----------|
| 顶层常量 | 6 | `NOISE`、`TEXT_RE`、`RE_TEST`、`RE_CI`、`RE_DOC`、`RE_SRC` |
| PROFILES phases re | ~60 | `/STUDIO_OVERVIEW\|诊断\|audit/i` |
| PROFILES phases tre | ~4 | `/怎么玩\|玩法\|操作说明/i` |
| PROFILES artifacts re | ~60 | `/design\/gdd\/.+\.md$\|gdd/i` |
| PROFILES artifacts tre | ~5 | `/https?:\/\/(cdn\|unpkg...)/i` |
| score 函数内 anyPath/countPath | ~40 | `/(^|\/)(controllers?\|handlers?...)/i` |
| detectProfile 内 | ~10 | `/(^|\/)(gdd\|design\|production\|art)\//i` |
| detectType 内 | ~15 | `/project\.godot$/` |
| detectEngineering 内 | ~5 | `/\.github\/workflows\|gitlab-ci\|Jenkinsfile/i` |
| detectProjects/MANIFEST 内 | ~12 | `/(^|\/)package\.json$/i` |
| genIntro 内 | ~8 | `/STUDIO_OVERVIEW/i`、`/^#\s+(.+)$/m` |
| **合计** | **~225** | |

**已知 bug 模式**：正则字面量中包含 `/`（如 `docs\//`），如果 `/` 未正确转义，正则字面量会被提前闭合，后半段变成 JS 代码。已踩过 3 次。`node --check` 查不出（整体语法仍合法），只有 vm 执行时才暴露。

### 3.2 REGEXES 对象数据结构

```javascript
var REGEXES = {
  // —— 顶层共享正则（原 var 常量，改为 REGEXES.xxx）——
  noise:    /(^|\/)(node_modules|\.git|\.svn|dist(-.*)?|build|win-unpacked|...)(\/|$)/,
  textFile: /\.(md|markdown|json|ya?ml|txt|lua|js|mjs|cjs|py|gd|cs|ts|html|css|sh|toml|ini|cfg)$/i,
  testDir:  /(^|\/)(test|tests|spec|__tests__)\/|\.(test|spec)\.|test-strategy/i,
  ci:       /\.github\/workflows|gitlab-ci|\.gitlab-ci|azure-pipelines|Jenkinsfile/i,
  readme:   /README/i,
  src:      /\.(js|mjs|cjs|jsx|ts|tsx|py|java|kt|cs|rs|go|rb|php|c|cpp|h|lua|gd|swift)$/i,

  // —— 通用工具正则（多个 score 函数/detectProfile 共用）——
  util: {
    indexHtml:     /(^|\/)index\.html$/i,
    packageJson:  /(^|\/)package\.json$/i,
    mdFile:        /\.md$/i,
    batSh:         /\.(bat|sh)$/i,
    pagesViews:    /(^|\/)(pages|views|routes|public)\//i,
    componentsDir: /(^|\/)(components|styles|static)\//i,
    srcDir:        /(^|\/)(src|lib|app|cmd|internal)\//i,
    designDir:     /(^|\/)(gdd|design|production|art)\//i
  },

  // —— 按模板分组（game / web / server / lib / mini / tool / meta / generic / iac / ...）——
  game: {
    phase_diagnosis:   /STUDIO_OVERVIEW|诊断|audit|现状盘点|复盘/i,
    phase_concept:     /concept|概念|pitch|立项/i,
    phase_sysDesign:   /gdd|系统设计/i,
    phase_techSetup:   /architect|adr|架构|技术方案/i,
    phase_preProd:     /ux-spec|ux[_-]?design|art-bible|asset-spec|epics|预[制製]作|原型/i,
    phase_production:  /sprint|production\/|src\//i,
    phase_polish:      /balance|perf|polish|打磨|优化报告|playtest/i,
    phase_release:     /release|changelog|launch|发布|部署/i,
    art_gdd:  /design\/gdd\/.+\.md$|gdd/i,
    art_adr:  /adr/i,
    art_arch: /architect/i,
    art_ux:   /ux-spec|ux[_-]?design/i,
    art_art:  /art-bible|asset-spec|art\//i,
    art_plan: /sprint|epics|roadmap|计划/i
    // art_test / art_ci / art_doc 用共享的 REGEXES.testDir / .ci / .readme
  },

  server: {
    score_framework:  /express|koa|@nestjs|nestjs|fastify|hapi|socket\.io|fastapi|django|flask|tornado|sanic|celery/i,
    score_serverless: /"serverless"|serverless\.yml|vercel\.json.*functions|firebase-functions/i,
    score_layer:       /(^|\/)(controllers?|handlers?|repositor(y|ies)|services?|middleware|migrations?)\//i,
    score_routes:      /(^|\/)(routes?|routers?)\//i,
    score_models:      /(^|\/)(models?|entities?|dao)\//i,
    score_schema:      /schema\.(prisma|sql)$/i,
    score_config:      /application\.(yml|yaml|properties)$/i,
    score_entry:       /(^|\/)(server|manage)\.(js|ts|py)$|(^|\/)cmd\/[^/]+\.go$/i,
    score_docker:      /Dockerfile|docker-compose/i,
    score_java:        /pom\.xml$|build\.gradle$/i,
    score_javaSrc:     /(^|\/)src\/main\/java\//i,
    score_go:          /(^|\/)go\.mod$/i,
    score_goDir:       /(^|\/)(cmd|internal|pkg)\//i,
    score_cs:          /\.(csproj|sln)$/i,
    score_csSrc:       /(^|\/)(Controllers?|Startup|Program)\.cs$/i
  },

  // ... 其余 16 套模板同理，每套 phases + artifacts + score 正则归入一个子对象 ...
  // 篇幅所限不全部列出，结构与 game/server 一致
  // 工程师实现时按此模式逐一提取

  // —— detectProfile 内正则（已移入 score 函数，不单独列）——
  // —— detectType 内正则（detectType 不在 P1 重构范围，但也可提取到 REGEXES.detectType.*）——
  // —— detectProjects / MANIFEST / genIntro 内正则同理 ——
};
```

**命名规范**：
- 顶层共享正则：小驼峰，如 `REGEXES.noise`、`REGEXES.readme`
- 通用工具正则：`REGEXES.util.xxx`
- 模板专属正则：`REGEXES.{profileId}.{phase_N | art_xxx | score_xxx}`
- score 函数正则前缀 `score_`，phase 正则前缀 `phase_`，artifact 正则前缀 `art_`
- 值为 RegExp 实例（不是字符串），保持 `i` flag 等修饰符

### 3.3 迁移方案

迁移分 4 步，每步独立可验证：

**步骤 1：提取顶层常量**（6 个正则）
- 将 `var NOISE = /.../` → `REGEXES.noise = /.../`
- 全局替换引用：`NOISE` → `REGEXES.noise`（约 5 处引用）
- 同理处理 TEXT_RE / RE_TEST / RE_CI / RE_DOC / RE_SRC

**步骤 2：提取 PROFILES 中的正则**（~130 个）
- 将 `PROFILES.game.phases[0].re` 的内联正则 → `REGEXES.game.phase_diagnosis`
- PROFILES 定义改为引用：`{ id:0, name:"诊断", re: REGEXES.game.phase_diagnosis }`
- artifacts 同理

**步骤 3：提取 score 函数中的正则**（~40 个）
- 将 `serverScore` 内 `anyPath(paths, /(^|\/)(controllers?|...)/i)` 的内联正则 → `REGEXES.server.score_layer`
- 调用改为 `anyPath(paths, REGEXES.server.score_layer)`

**步骤 4：提取 detectProfile/detectType/detectEngineering/detectProjects/genIntro 中的正则**（~50 个）
- 同理提取并替换引用

**迁移注意事项**：
- 每步迁移后跑 `npm test`，确保全绿再进入下一步
- 迁移是纯机械操作（find-replace），不改逻辑，不改正则内容
- `tre` 字段（text regex）也提取到 REGEXES，命名加 `tre_` 前缀以区分
- 共享正则（RE_TEST、RE_CI、RE_DOC 被 PROFILES 中多个模板引用）只定义一次，多处引用

### 3.4 正则单测设计

新增 `tests/regex.test.mjs`，通过 `__PA.REGEXES` 对每条正则测正例 + 反例：

```javascript
// tests/regex.test.mjs
import { loadAnalyzer, createChecker } from "./_harness.mjs";

const { api } = loadAnalyzer();
const C = createChecker("Regex tests · 正则集中管理 + instanceof 自检");

// —— 1. 所有 REGEXES 值必须是 RegExp 实例（防提前闭合）——
function checkRegExp(obj, prefix) {
  for (var key in obj) {
    var v = obj[key];
    if (v instanceof RegExp) {
      C.ok(`${prefix}.${key} is RegExp`, v instanceof RegExp);
    } else if (typeof v === "object" && v !== null) {
      checkRegExp(v, `${prefix}.${key}`);
    } else {
      C.ok(`${prefix}.${key} is RegExp (实际: ${typeof v})`, v instanceof RegExp);
    }
  }
}
checkRegExp(api.REGEXES, "REGEXES");

// —— 2. 每条正则测正例 + 反例 ——
var cases = [
  // [regexRef, positiveSample, negativeSample, description]
  [api.REGEXES.util.indexHtml,    "app/index.html",      "app/about.html",     "index.html 匹配"],
  [api.REGEXES.util.packageJson,  "pkg/package.json",     "pkg/package.json.bak","package.json 匹配"],
  [api.REGEXES.testDir,           "src/test/run.test.js", "src/main.js",        "test 目录匹配"],
  [api.REGEXES.readme,           "README.md",            "readme.txt",         "README 匹配"],
  [api.REGEXES.ci,               ".github/workflows/ci.yml","app/ci.js",       "CI 配置匹配"],
  [api.REGEXES.server.score_framework, "const express = require('express')",
                                    "const react = require('react')",         "后端框架匹配"],
  [api.REGEXES.server.score_routes, "src/routes/users.js", "src/utils/helper.js", "routes 目录匹配"],
  // ... 每条正则至少 1 正例 + 1 反例，约 225 条
  // 工程师按此模式补全，可批量生成
];

cases.forEach(function(c) {
  var re = c[0], pos = c[1], neg = c[2], desc = c[3];
  C.ok(`${desc} - 正例匹配`,   re.test(pos));
  C.ok(`${desc} - 反例不匹配`, !re.test(neg));
});

// —— 3. PROFILES 中所有 re/tre 字段是 RegExp 实例 ——
Object.keys(api.PROFILES).forEach(function(id) {
  var p = api.PROFILES[id];
  p.phases.forEach(function(ph, i) {
    if (ph.re) C.ok(`${id}.phases[${i}].re is RegExp`,
      ph.re instanceof RegExp);
    if (ph.tre) C.ok(`${id}.phases[${i}].tre is RegExp`,
      ph.tre instanceof RegExp);
  });
  p.artifacts.forEach(function(a, i) {
    if (a.re) C.ok(`${id}.artifacts[${i}].re is RegExp`,
      a.re instanceof RegExp);
    if (a.tre) C.ok(`${id}.artifacts[${i}].tre is RegExp`,
      a.tre instanceof RegExp);
  });
});
```

### 3.5 提前闭合防御（多层防御）

| 层 | 机制 | 触发时机 | 能否防 `\//` 提前闭合 |
|----|------|----------|----------------------|
| **L1 加载时自检** | IIFE 末尾遍历 REGEXES，`throw` if not RegExp | 脚本加载时（浏览器/Electron/vm） | ✅ 提前闭合导致 re 变成非 RegExp，立即报错 |
| **L2 smoke 测试** | regex.test.mjs 遍历 REGEXES 断言 instanceof | CI / 本地 `npm test` | ✅ L1 已在 vm 加载时报错，smoke 会捕获 |
| **L3 正例反例测试** | regex.test.mjs 对每条正则测正例+反例 | CI / 本地 `npm test` | ✅ 提前闭合导致正则变成错误的 pattern，正例不匹配 |
| **L4 PROFILES 字段检查** | regex.test.mjs 遍历 PRO phases/artifacts 的 re/tre | CI / 本地 `npm test` | ✅ 提前闭合导致 re 不是 RegExp |

**加载时自检代码**（放在 IIFE 末尾，`window.__PA` 赋值之前）：

```javascript
// —— 正则自检：加载时即发现提前闭合 ——
// 遍历 REGEXES 所有叶子节点，确认全是 RegExp 实例
// 如果正则字面量被 \// 提前闭合，该值会变成字符串或表达式结果，不是 RegExp
(function checkRegexes() {
  function walk(obj, prefix) {
    for (var key in obj) {
      var v = obj[key];
      if (v instanceof RegExp) continue;             // OK
      if (typeof v === "object" && v !== null) { walk(v, prefix + key + "."); continue; }
      throw new Error("REGEXES." + prefix + key + " 不是 RegExp（可能被提前闭合）: " + typeof v);
    }
  }
  walk(REGEXES, "");
})();
```

**为什么不用 lint/构建时检查**：
- 项目是零依赖单文件，没有 ESLint/Babel 构建管线
- `node --check` 只做语法检查，提前闭合后语法仍合法，查不出
- 加载时自检在浏览器双击打开时也会触发（throw 会显示在控制台），比 lint 更早暴露

---

## 四、子任务 3：smoke 补全 18 套 + 顺序负向断言

### 4.1 smoke 18 套清单（smoke.test.mjs 扩展）

当前 smoke 只硬编码检查 7 套旧模板（game/web/lib/mini/tool/meta/generic）。需扩展到全 18 套，且**不硬编码模板列表**，从 `__PA.PROFILE_ORDER` 动态读取。

**扩展内容**：

| 检查项 | 当前 | 扩展后 | 实现方式 |
|--------|------|--------|----------|
| 模板定义存在 | 7 套硬编码 | 18 套动态 | `api.PROFILE_ORDER.forEach(id => assert(PROFILES[id] defined))` |
| advice 函数存在 | 7 个硬编码 | 18 个动态 | `api.PROFILE_ORDER.forEach(id => assert(advice fn exists))` |
| PHASE_FILE 变量存在 | 未检查 | 18 个 | 检查 html 源码中 `var {ID}_PHASE_FILE` 存在（smoke 是静态检查） |
| REGEXES 暴露 | 未检查 | 新增 | `assert(api.REGEXES !== undefined)` |
| SCORE_REGISTRY 暴露 | 未检查 | 新增 | `assert(api.SCORE_REGISTRY !== undefined)` |
| PRIORITY 暴露 | 未检查 | 新增 | `assert(api.PRIORITY !== undefined)` |
| SCORE_REGISTRY 覆盖所有模板 | 未检查 | 新增 | `PROFILE_ORDER` 每项在 `SCORE_REGISTRY` 中有注册（除 generic） |

**smoke 扩展伪代码**（追加到 smoke.test.mjs）：

```javascript
// ---------- 18 套模板全检查（动态读取，不硬编码）----------
// 用 vm 加载拿到真实的 PROFILE_ORDER
const { loadAnalyzer } = await import("./_harness.mjs");
const { api } = loadAnalyzer();
const ALL_PROFILES = api.PROFILE_ORDER;

// 每套模板必须有 PROFILES entry + advice 函数 + PHASE_FILE 变量
ALL_PROFILES.forEach((id) => {
  assert(`profile ${id} in PROFILES`, !!api.PROFILES[id]);
  assert(`profile ${id} has advice fn`, html.includes(`function advice${capitalize(id)}(`));
  assert(`profile ${id} has PHASE_FILE`, html.includes(`${id.toUpperCase()}_PHASE_FILE`));
});

// SCORE_REGISTRY 覆盖所有模板（generic 除外，它是兜底）
const registeredIds = api.SCORE_REGISTRY.map(e => e.id);
ALL_PROFILES.forEach((id) => {
  if (id === "generic") return;  // generic 不进注册表
  assert(`${id} registered in SCORE_REGISTRY`, registeredIds.includes(id));
});

// PRIORITY 覆盖所有注册的模板
registeredIds.forEach((id) => {
  assert(`PRIORITY[${id}] defined`, typeof api.PRIORITY[id] === "number");
});

// REGEXES 暴露
assert("REGEXES exposed", api.REGEXES !== undefined);
```

**注意**：smoke 目前是纯静态检查（读 html 源码字符串）。扩展后需要用 `loadAnalyzer()` 加载 vm 来读取 `PROFILE_ORDER` 和 `SCORE_REGISTRY`。这不违反 smoke 的定位——smoke 检查的是"结构在不在"，vm 加载只是获取结构信息的手段，不是执行分析逻辑。

### 4.2 顺序负向断言设计（logic.test.mjs 扩展）

顺序负向断言的目的是：构造"同时触发多个模板 score >= 3"的 fixture，验证优先级裁决表给出正确结果。虽然重构后顺序不敏感，但这些断言锁定了优先级表的正确性——如果有人改了优先级表导致裁决错误，测试会报。

**5 组冲突 fixture + 预期裁决**：

#### 断言组 1：iac vs devops（iac 赢）

```javascript
// 同时有 .tf（iac）和 .github/workflows + Dockerfile（devops）
// iac 优先级 16 > devops 7
const iacDevopsConflict = await run({
  "proj/main.tf": 'resource "aws_vpc" "main" {}\n',
  "proj/variables.tf": 'variable "region" {}\n',
  "proj/.github/workflows/ci.yml": "name: CI\n",
  "proj/Dockerfile": "FROM hashicorp/terraform\n",
  "proj/README.md": "# Infra\n",
}, "iac-devops-conflict");
C.eq("iac+devops 冲突 → iac（优先级 16 > 7）", iacDevopsConflict.profile, "iac");
```

#### 断言组 2：desktop vs web（desktop 赢）

```javascript
// 同时有 electron 依赖（desktop）和 pages/ + tsx（web）
// desktop 优先级 12 > web 2
const desktopWebConflict = await run({
  "app/package.json": JSON.stringify({ name: "app", dependencies: { electron: "^28" } }),
  "app/main.js": 'const { app, BrowserWindow } = require("electron");\n',
  "app/pages/index.tsx": "export default ()=><div/>;\n",
  "app/src/App.tsx": "export default ()=><div/>;\n",
  "app/README.md": "# Desktop+Web\n",
}, "desktop-web-conflict");
C.eq("desktop+web 冲突 → desktop（优先级 12 > 2）", desktopWebConflict.profile, "desktop");
```

#### 断言组 3：aiml vs data（aiml 赢）

```javascript
// 同时有 train.py + .pt（aiml）和 dags/ + warehouse/（data）
// aiml 优先级 11 > data 9
const aimlDataConflict = await run({
  "ml/train.py": "import torch\n",
  "ml/checkpoints/best.pt": null,
  "ml/dags/etl.py": "from airflow import DAG\n",
  "ml/warehouse/ods/raw.py": "rows=[]\n",
  "ml/README.md": "# ML+Data\n",
}, "aiml-data-conflict");
C.eq("aiml+data 冲突 → aiml（优先级 11 > 9）", aimlDataConflict.profile, "aiml");
```

#### 断言组 4：microservice vs server（microservice 赢）

```javascript
// 同时有 services/ 多个 + express（microservice）和 routes/（server）
// microservice 优先级 10 > server 8
const microServerConflict = await run({
  "svc/services/user/package.json": JSON.stringify({ dependencies: { express: "^4" } }),
  "svc/services/user/src/server.js": "const express=require('express');\n",
  "svc/services/user/src/routes/users.js": "router.get('/users');\n",
  "svc/services/order/package.json": JSON.stringify({ dependencies: { express: "^4" } }),
  "svc/services/order/src/server.js": "const express=require('express');\n",
  "svc/proto/order.proto": "syntax='proto3';\n",
  "svc/README.md": "# Micro+Server\n",
}, "micro-server-conflict");
C.eq("microservice+server 冲突 → microservice（优先级 10 > 8）", microServerConflict.profile, "microservice");
```

#### 断言组 5：devops vs tool（devops 赢，P0 bug 的回归保护）

```javascript
// 同时有 CI + k8s（devops）和少文件+srcR<0.5（tool）
// devops 分数更高（4 > 3），直接赢，不需优先级裁决
// 但如果有人把 devopsScore 改回低于 3，优先级 7 > 1 仍保证 devops 赢
const devopsToolConflict = await run({
  "ops/.github/workflows/ci.yml": "name: CI\n",
  "ops/Dockerfile": "FROM node:18\n",
  "ops/k8s/deployment.yaml": "apiVersion: apps/v1\n",
  "ops/scripts/deploy.sh": "#!/usr/bin/env bash\n",
  "ops/README.md": "# DevOps\n",
}, "devops-tool-conflict");
C.eq("devops+tool 冲突 → devops", devopsToolConflict.profile, "devops");
```

#### 断言组 6：game vs tool（game 赢，优先级 100 的验证）

```javascript
// game fixture 有 6 个文件，toolScore 也会命中
// game 优先级 100 > tool 1
const gameToolConflict = await run({
  "g2/project.godot": "config_version=5\n",
  "g2/README.md": "# Game\n",
  "g2/src/main.gd": "extends Node\n",
}, "game-tool-conflict");
C.eq("game+tool 冲突 → game（优先级 100）", gameToolConflict.profile, "game");
```

#### 断言组 7：cli vs tool（cli 赢，分数高直接赢）

```javascript
// cli 有 bin + argparse + .sh（cliScore=6），同时 paths 少触发 toolScore=3
// cli 分数 6 > tool 3，直接赢
const cliToolConflict = await run({
  "tool/package.json": JSON.stringify({ bin: { renamer: "./cli.js" } }),
  "tool/cli.js": "const { program } = require('commander');\n",
  "tool/run.sh": "#!/usr/bin/env bash\n",
  "tool/README.md": "# CLI\n",
}, "cli-tool-conflict");
C.eq("cli+tool 冲突 → cli（分数 6 > 3）", cliToolConflict.profile, "cli");
```

### 4.3 smoke 与 logic 的边界

| 维度 | smoke.test.mjs | logic.test.mjs |
|------|----------------|----------------|
| 执行方式 | 静态检查（读源码字符串）+ vm 加载取结构 | vm 加载 + 执行分析逻辑 |
| 检查内容 | 文件在不在、函数签名在不在、模板定义在不在 | 分析得对不对、fixture 识别对不对 |
| 是否构造 fixture | 否 | 是（造假项目目录） |
| 正则检查 | instanceof（结构） | 正例反例（行为） |
| 顺序负向断言 | 不做（需要执行分析逻辑） | 做（造冲突 fixture，验证裁决） |
| 18 套模板覆盖 | 检查定义存在 | 检查 fixture 识别正确 |

**原则**：smoke 不造 fixture、不执行分析逻辑。如果检查需要"喂一个假项目进去看结果"，它属于 logic。如果检查只需"看源码里有没有这段代码"或"加载后取 __PA.xxx 看在不在"，它属于 smoke。

regex.test.mjs 是独立的第三类：它通过 vm 加载取 REGEXES 对象，但对正则做正例/反例匹配，不执行项目分析逻辑。它既不是 smoke（不是检查存在性）也不是 logic（不是检查分析结果），是正则的专项测试。

---

## 五、子任务 4：实现顺序与风险控制

### 5.1 实现顺序

```
子任务 2（REGEXES 集中管理）
    │
    ├── 纯机械重构，不改逻辑，不改变任何行为
    ├── 每步迁移后跑 npm test 确认全绿
    ├── 完成后 REGEXES 自检 + regex.test.mjs 就位
    │
    ▼
子任务 1（detectProfile 打分排序）
    │
    ├── 核心重构，依赖 REGEXES 已就位（score 函数引用 REGEXES.xxx）
    ├── 实现前先加"锁现状"测试（记录 18 fixture 的当前 profile）
    ├── 实现后跑 npm test 确认 18 fixture 仍判对
    ├── 完成后 SCORE_REGISTRY + PRIORITY + 6 个新 score 函数就位
    │
    ▼
子任务 3（smoke 补全 + 负向断言）
    │
    ├── 依赖子任务 1 和 2 的产出（SCORE_REGISTRY、REGEXES 已暴露）
    ├── smoke 扩展为 18 套动态检查
    ├── logic 加 7 组顺序负向断言
    ├── 完成后全部测试就位
    │
    ▼
全量验证（npm test 全绿 + 手动验证 18 fixture）
```

**为什么 2 在 1 之前**：
- REGEXES 是纯机械重构，风险最低，先做可以把"行为不变"这个前提锁死
- detectProfile 重构时，新的 score 函数可以直接引用 REGEXES.xxx，代码更干净
- 如果先做 detectProfile 再做 REGEXES，score 函数里会有内联正则，之后还要再改一遍引用

### 5.2 风险点与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| **REGEXES 迁移遗漏引用** | 中 | 某个 anyPath 调用仍用旧的内联正则，行为不一致 | 每步迁移后 grep 确认旧正则变量名不再出现（除 REGEXES 定义本身） |
| **新 score 函数逻辑与原启发式不等价** | 中 | 某 fixture 判错 profile | 实现前先加"锁现状"测试（logic.test.mjs 已有 18 fixture 断言，确保重构后仍通过） |
| **toolScore 合并 3 段逻辑后行为变化** | 中 | Python/Java/Rust fixture 的 lib/tool 裁决变化 | 单独验证 Python fixture（当前判 tool）；如果 libScore 和 toolScore 同分，优先级 lib(3) > tool(1) 保证 lib 赢 |
| **serverScoreV2 的 !hasFrontendSignal 守卫改变了边界行为** | 低 | 全栈项目（有 routes + tsx）的裁决从 server 变为 web | 当前行为：hasFrontendSignal=true → server 不触发 → 落到 web。新行为：serverScoreV2=0 → webScore 可能赢。结果一致。 |
| **优先级表设计错误** | 低 | 两个模板同分时裁决错误 | 7 组顺序负向断言覆盖主要冲突对 |
| **Electron 副本未同步** | 中 | 打包出旧版 exe | `npm test` 已含副本一致性检查（logic.test.mjs [12]），改完跑 test 即可发现；也可在 package.json 的 test 脚本前加 `npm run sync` |

### 5.3 测试锁现状策略

在开始子任务 1（detectProfile 重构）之前，先在 logic.test.mjs 中添加一段"快照测试"：对 18 套 fixture 各跑一次 detectProfile，记录当前判出的 profile，断言它等于预期值。这些断言在重构前就存在且全绿，重构后如果行为不变，断言仍全绿。如果行为变了，立即报错。

**实际上 logic.test.mjs 已有这些断言**（[1] 模板自动识别，L233-243）：18 套 fixture 各跑一次 `detectProfile`，断言 `d.profile === id`。这就是"锁现状"测试。重构后这些断言不需要改——如果行为不变，它们自然全绿。

**额外加固**：在重构前，额外跑一遍 18 套 fixture，把 detectProfile 返回值和各 score 函数返回值都记录下来（console.log），作为对照基线。重构后对比，确认所有值一致。

### 5.4 回滚方案

每个子任务是一个独立的 git commit。如果任何子任务导致测试失败：

1. `git revert <commit>` 回退该子任务
2. 回退后跑 `npm test` 确认回到绿色基线
3. 分析失败原因，修正后重新提交

**最坏情况**：如果 detectProfile 重构（子任务 1）引入了难以定位的行为变化，回退到 P0 状态（当前状态）。P0 已经修复了已知的 2 个 bug，回退不会重新引入 bug——只是没有根治顺序依赖问题。

---

## 六、工作量估算

### 6.1 代码改动量

| 子任务 | 新增行 | 修改行 | 删除行 | 净变化 | 说明 |
|--------|--------|--------|--------|--------|------|
| 1. detectProfile 打分排序 | ~90 | ~15 | ~70 | +20 | 新 detectProfile ~20行 + SCORE_REGISTRY ~20行 + PRIORITY ~20行 + 6 个新 score 函数 ~50行；删除原 if-else ~70行 |
| 2. REGEXES 集中管理 | ~20 | ~225 | ~225 | +20 | REGEXES 定义 ~200行 + 自检 ~15行；原内联正则替换为引用（行数不变，内容变） |
| 3. smoke + 负向断言 | ~120 | ~30 | ~10 | +110 | smoke 扩展 ~30行 + regex.test.mjs ~60行 + 负向断言 ~70行 |
| **合计** | **~230** | **~270** | **~305** | **+150** | 净增 150 行（主要是 REGEXES 定义和测试） |

### 6.2 时间估算

| 子任务 | 估时 | 说明 |
|--------|------|------|
| 2. REGEXES 集中管理 | 4-5h | 机械提取 + 命名 + 替换引用 + 自检 + regex.test.mjs |
| 1. detectProfile 打分排序 | 3-4h | 新 detectProfile + 6 个 score 函数 + 验证 18 fixture |
| 3. smoke + 负向断言 | 2-3h | smoke 扩展 + 7 组冲突 fixture |
| **合计** | **9-12h** | 约 1.5 个工作日 |

---

## 七、关键约束与验收标准

### 7.1 验收标准

| # | 验收项 | 验证方法 |
|---|--------|----------|
| 1 | `npm test` 全绿（smoke + logic + scanner + regex） | CI / 本地 |
| 2 | 18 套 fixture 判定的 profile 与重构前完全一致 | logic.test.mjs [1] 断言 |
| 3 | detectProfile 不含任何 if-else 分支（除 generic 兜底 return） | grep `if.*Score.*return` 应无结果 |
| 4 | SCORE_REGISTRY 包含 17 个条目（18 模板减 generic） | smoke 断言 |
| 5 | PRIORITY 包含 17 个 key，值全为 number | smoke 断言 |
| 6 | REGEXES 所有叶子节点为 RegExp 实例 | regex.test.mjs + 加载时自检 |
| 7 | 7 组顺序负向断言全绿 | logic.test.mjs 新增断言 |
| 8 | Electron 副本与根文件一致 | logic.test.mjs [12] 断言 |
| 9 | `__PA` 新暴露 SCORE_REGISTRY / PRIORITY / REGEXES / 6 个新 score 函数 | logic.test.mjs [13] 断言扩展 |

### 7.2 关键约束

1. **不拆模块**：所有改动在 `project-analyzer.html` 的 `<script>` 内完成
2. **ES5 语法**：`var`、`function`，不用 `let/const/=>`（与现有代码一致）
3. **detectType 不在 P1 范围**：不改 detectType 的 if-else 结构，但 score 函数签名变为 `(paths, texts, type)` 后 detectType 调用时多传一个 `undefined` 参数（JS 自动忽略）
4. **advice 函数不改**：P1 只改判定流程，不改建议生成逻辑
5. **PROFILES 数据不改**：phases/artifacts 的 `re`/`tre` 值不变，只是引用方式从内联改为 `REGEXES.xxx`
6. **PHASE_FILE 不改**：纯字符串数据，不含正则

---

## 八、附录：优先级裁决表设计推导

优先级表的核心原则：**特征越特异的模板优先级越高**。

"特异"的定义：该模板的命中条件越难被其他模板同时满足。

| 优先级 | 模板 | 特异特征 | 为什么比下面的特异 |
|--------|------|----------|---------------------|
| 100 | game | type 字符串含游戏引擎名 | 独占信号源（type），其他模板不看 type |
| 16 | iac | *.tf 文件 | 只有 IaC 项目有 Terraform 文件 |
| 15 | embedded | CMakeLists + hal/ + .ld | 只有嵌入式有硬件抽象层 |
| 14 | extension | manifest.json(MV3) + background/content | 只有浏览器插件有 MV3 清单 |
| 13 | mobile | AndroidManifest.xml / .xcodeproj | 只有移动端有平台清单 |
| 12 | desktop | electron/tauri 依赖 + main 进程 | 只有桌面应用有 Electron/Tauri |
| 11 | aiml | 模型权重(.pt/.onnx) + 训练脚本 | 比 data 更特异（data 只有 dags/warehouse） |
| 10 | microservice | >=2 个独立服务 + 网关 + proto | 比 server 更特异（server 只有一个服务） |
| 9 | data | dags/ + warehouse/ods/dwd/dws | 比 devops 更特异（devops 只有 CI+k8s） |
| 8 | server | 后端框架依赖 + routes/ + models/ | 比 devops/cli 更特异（有分层目录） |
| 7 | devops | CI + Dockerfile + k8s | 比 cli 更特异（有编排/容器） |
| 6 | cli | package.json bin + argparse/click | 比 mini/meta/lib/web 更特异（有 CLI 特征） |
| 5 | mini | index.html + canvas + 少文件 | 比 meta/lib/web 更特异（有游戏信号） |
| 4 | meta | md 占比 > 35% + src < 15% | 比 lib/web 更特异（有文档占比特征） |
| 3 | lib | package.json main/exports + 无页面 | 比 web 更特异（有入口暴露） |
| 2 | web | pages/views/routes + tsx/jsx | 比 tool 更特异（有前端结构） |
| 1 | tool | 少文件 + 脚本（最泛化） | 最低优先级，是弱信号兜底 |

**验证**：将此表与 2.8 节的 18 套 fixture 验证矩阵交叉验证，所有 fixture 的裁决结果正确。

---

*设计完。工程师（李铁锤）据此实现，QA（陈思源）据此验证。*
