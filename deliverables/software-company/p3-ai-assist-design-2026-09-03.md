# P3 · AI 辅助分析功能设计

> 日期：2026-09-03 ｜ 状态：设计中 → 实现中 ｜ 作者：架构师·高见远
> 依据：用户需求「大模型辅助分析 + 每步校验 + 开关 + API key + 提示词文件 + 记忆留存」

## 1. 功能概述

给项目结构分析器加一层「AI 复核 + 补充」能力：

- **每步校验**：每个 phase/artifact 旁加「AI 校验」按钮，AI 判断这条分析准不准 + 给理由 + 标「可忽略」
- **整体总结**：文档不全/不清晰时，AI 基于全 data 补全总结 + 改进建议
- **开关控制**：顶部「AI 辅助」开关，关时所有 AI 入口隐藏，主功能不受影响
- **提示词外置**：prompts/ 目录，目的/规则/规范分离，用户可编辑调整 AI 行为
- **记忆留存**：AI 反馈摘要存 localStorage 跨次参考 + 可导出 .md 文件累积

## 2. 架构（四层）

```
┌─ 配置层 ─────────────────────────────────────┐
│  顶部「AI 设置」按钮 → 抽屉面板               │
│  字段：enabled / baseURL / apiKey / model /  │
│        promptsDir                            │
│  存储：localStorage(pa_ai_cfg_v1)            │
│  默认：baseURL=api.openai.com/v1             │
│        model=gpt-4o-mini promptsDir=prompts/ │
└──────────────────────────────────────────────┘
┌─ 调用层 ─────────────────────────────────────┐
│  callAI(messages, opts) → {ok,data,error}    │
│  封装 fetch OpenAI 兼容接口                   │
│  错误降级：网络/key/quota → toast 不阻断     │
│  loadPrompt(name, vars) 读 .md + 注入占位符  │
└──────────────────────────────────────────────┘
┌─ 应用层 ─────────────────────────────────────┐
│  每步校验：phase/artifact 旁「🔍」按钮       │
│    → step-check.md + dataSummary → callAI    │
│    → 小卡片：accuracy/reason/canIgnore/建议  │
│  整体总结：卡片顶部「AI 总结」按钮           │
│    → summary.md + fullData → callAI          │
│    → 总结卡片：summary/gaps/suggestions      │
└──────────────────────────────────────────────┘
┌─ 资产层 ─────────────────────────────────────┐
│  prompts/ 目录（5 文件，用户可编辑）         │
│  记忆留存：localStorage(pa_ai_memory_v1)     │
│    滚动保留 50 条 + 可导出 .md               │
└──────────────────────────────────────────────┘
```

## 3. 提示词文件设计（prompts/）

| 文件 | 作用 |
|------|------|
| `purpose.md` | 目的：分析器做什么、AI 辅助的角色、输出要求 |
| `rules.md` | 规则：不臆测、给理由、标可忽略、中文输出、JSON 格式 |
| `spec.md` | 规范：AI 返回 JSON 格式定义（每步校验 + 整体总结两套 schema） |
| `step-check.md` | 每步校验模板，占位符 `{{stepType}}`/`{{stepId}}`/`{{dataSummary}}` |
| `summary.md` | 整体总结模板，占位符 `{{fullData}}` |

**设计原则**：
- 目的/规则/规范分离 → 用户改一处不影响其他
- 占位符用 `{{var}}` 双花括号，loadPrompt 简单 replace
- 用户可编辑这些文件调整 AI 行为，无需改代码

## 4. AI 调用模块

```javascript
var AI_CONFIG_DEFAULTS = {
  enabled: false,
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  promptsDir: "prompts"
};

function loadAIConfig(){
  // 读 localStorage(pa_ai_cfg_v1)，合并默认值，apiKey 为空时 enabled 强制 false
}
function saveAIConfig(cfg){ /* 写 localStorage，异常静默降级 */ }

function callAI(messages, opts){
  // 1. 读配置，enabled=false 或 apiKey 空 → 返回 {ok:false, error:"AI 未启用"}
  // 2. fetch(baseURL + "/chat/completions", {method,headers:{Authorization:Bearer},body:JSON})
  // 3. 成功 → {ok:true, data:json.choices[0].message.content}
  // 4. 失败 → {ok:false, error:msg}，不抛错，不阻断主功能
}

function loadPrompt(name, vars){
  // 1. 读 promptsDir/name.md（fetch 同源文件，Electron 下 file:// 可用）
  // 2. 替换 {{var}} 占位符
  // 3. 文件不存在 → 返回内置兜底模板
}
```

**错误降级清单**：
- AI 未启用 / apiKey 空 → 按钮隐藏或提示「请先配置」
- 网络失败 / CORS → toast「AI 连接失败，请检查 base URL」
- 401 → toast「API key 无效」
- 429 → toast「额度不足或请求过频」
- JSON 解析失败 → 提示「AI 返回格式异常，原文显示」

## 5. 配置面板（抽屉式）

复用 history 抽屉样式（drawer + btn-text）：

```
顶部 .bar 加「AI 设置」按钮（带 ● enabled 状态点）
  ↓ 点击
抽屉面板：
  [✓] 启用 AI 辅助
  Base URL:    [https://api.openai.com/v1    ]
  API Key:     [**********                    ] (password)
  Model:       [gpt-4o-mini                   ]
  提示词目录:   [prompts/                      ]
  [测试连接] [保存] [清空记忆]
```

- 保存 → saveAIConfig → 刷新按钮状态点
- 测试连接 → callAI([{role:"user",content:"ping"}]) → 显示「连接正常/失败原因」
- 清空记忆 → clearAIMemory → 确认弹窗

## 6. 每步校验设计

### 6.1 按钮插入点

```javascript
// renderCard 内（L2429 phase 渲染）
d.phases.list.forEach(function(p){
  h += '<div class="ph">...<button class="ai-check" data-stype="phase" data-sid="'
       + p.id + '" data-label="' + d.label + '">🔍</button></div>';
});

// L2444 artifact 渲染
d.artifacts.forEach(function(a){
  h += '<div class="row">...<button class="ai-check" data-stype="artifact" data-sid="'
       + a.key + '" data-label="' + d.label + '">🔍</button></div>';
});
```

### 6.2 校验流程

```javascript
function aiCheckStep(label, stepType, stepId){
  // 1. 找到对应 data（A 或 B）+ step 信息（phase.name/evidence 或 artifact.label/has）
  // 2. 构造 dataSummary = {name, files, type, profile, phases:done/total, artifacts:done/total}
  // 3. loadPrompt("step-check", {stepType, stepId, dataSummary}) → prompt
  // 4. callAI([{role:"system",content:rules}, {role:"user",content:prompt}])
  // 5. 解析 JSON → {accuracy, reason, canIgnore, suggestion}
  // 6. 显示小卡片 + saveAIMemory(...)
}
```

### 6.3 结果展示

```html
<div class="ai-result">
  <span class="ai-acc high|medium|low">准确性：高/中/低</span>
  <div class="ai-reason">理由：...</div>
  <div class="ai-sugg">建议：...</div>
  <label><input type="checkbox" data-act="ignore"> 忽略此条建议</label>
</div>
```

## 7. 整体总结设计

```javascript
function aiSummary(label){
  // 1. 找到 data（A 或 B）
  // 2. fullData = JSON.stringify(data)（注意：data 可能含循环引用 → exportJSONData 已验证无循环）
  // 3. loadPrompt("summary", {fullData}) → prompt
  // 4. callAI([{role:"system",content:rules}, {role:"user",content:prompt}])
  // 5. 解析 JSON → {summary, gaps:[], suggestions:[]}
  // 6. 显示总结卡片 + saveAIMemory({stepType:"summary", ...})
}
```

按钮位置：renderCard 顶部（阶段进度标题旁）。

## 8. 记忆留存

### 8.1 数据结构

```javascript
// localStorage(pa_ai_memory_v1) = [{...}, ...]
{
  id: Date.now() + HIST_SEQ++,  // 防同毫秒撞 id（P2 方向 1 踩过）
  ts: ISO 时间,
  project: 项目名,
  stepType: "phase"|"artifact"|"summary",
  stepId: phase.id 或 artifact.key 或 "summary",
  accuracy: "high"|"medium"|"low",
  reason: "...",
  canIgnore: false,
  suggestion: "..."
}
```

### 8.2 容量管理

- MAX_AI_MEMORY = 50
- 超限 → 删最旧（unshift 新条 + 截断到 50）
- localStorage 异常 → 静默降级

### 8.3 导出格式

```markdown
# AI 辅助分析记忆 · 导出时间

## 项目：xxx
### [phase] P0 · 准确性：中
- 理由：...
- 建议：...
- 可忽略：否

### [summary] 整体总结
- 总结：...
...
```

## 9. 测试策略

### 9.1 smoke（结构断言）
- prompts/ 5 文件存在
- AI 模块函数定义（loadAIConfig/saveAIConfig/callAI/loadPrompt/saveAIMemory/...）
- 配置面板 DOM（aiSettings 抽屉 + 字段 + 顶部按钮）
- __PA 暴露 AI 模块
- AI 未启用时校验按钮隐藏（CSS 或渲染判断）

### 9.2 logic（行为断言）
- **[20] 每步校验**：callAI mock（注入假 fetch）+ prompt 构造含占位符 + 错误降级 + 结果解析 + 记忆写入 + canIgnore
- **[21] 整体总结**：prompt 构造含 fullData + 结果解析（summary/gaps/suggestions）+ 记忆写入
- **[22] 记忆导出**：exportAIMemory 返回 .md 格式 + 按项目分组 + 字段齐全 + 容量滚动（超 50 删最旧）

### 9.3 变异验证
- callAI 降级失效（不返回 {ok:false} 而抛错）
- 记忆容量失效（超 50 不删）
- prompt 占位符注入失效（{{var}} 不替换）
- 结果解析失效（JSON 解析不兜底）
- 配置读写失效（默认值不合并）

## 10. 实现分批

| 批 | 任务 | commit |
|----|------|--------|
| 1 | prompts/ 5 文件 + AI 调用/配置模块 + 配置面板 + 记忆留存 + __PA 暴露 + smoke | 1 |
| 2 | render 改造（每步按钮）+ 校验结果展示 + logic [20] | 2 |
| 3 | 整体总结按钮 + logic [21][22] + 变异验证 + overview | 3 |

## 11. 风险与边界

- **CORS**：浏览器版 fetch 同源限制，Electron 下 file:// 可读本地 prompts/。纯浏览器版 prompts/ 读不到时用内置兜底。
- **API key 安全**：存 localStorage（同 history），用户自担风险。不上传任何地方。
- **token 消耗**：手动触发，用户掌控。fullData 可能较大 → summary.md 里要求 AI 只看关键字段。
- **JSON 解析**：AI 返回可能非标准 JSON → 先 strip ```json``` 围栏 + try/catch 兜底原文显示。
- **循环引用**：exportJSONData 已验证 data 无循环引用，fullData 直接 stringify 安全。

## 12. 验收标准

- AI 未启用时所有 AI 入口隐藏，主功能完全不受影响
- 配置面板能读写持久化，测试连接可用
- 每步校验按钮点击 → AI 返回 → 小卡片显示 → 记忆写入
- 整体总结按钮点击 → 总结卡片显示 → 记忆写入
- 记忆导出 .md 格式正确，按项目分组
- 全量测试全绿（smoke + regex + logic + scanner）
- 变异验证 5/5 被抓住
