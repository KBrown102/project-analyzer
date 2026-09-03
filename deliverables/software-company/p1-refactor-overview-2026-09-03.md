# 项目结构分析器 1.0.0 · P1 重构完成概览

> 本轮把 detectProfile 从"if-else 顺序判定"重构为"打分排序 + 优先级裁决"，根治 B1/B2 类模板误判。

## 做了什么

### 1. detectProfile 改打分排序（核心）
- **之前**：83 行 if-else 链，18 个分支顺序敏感——B1（desktop 被 mini 吞）、B2（devops 被 tool 吞）根因。
- **之后**：`SCORE_REGISTRY`（17 条，generic 兜底不在表）注册所有 score 函数 → 遍历打分 → 过滤达标(≥3) → 按 `score 降序, priority 降序` 排序取最高。
- **效果**：SCORE_REGISTRY 顺序怎么重排，结果都不变。顺序依赖彻底消除。

### 2. 7 个新 score 函数
`gameScoreV2 / metaScore / miniScore / toolScore / libScore / webScore / serverScoreV2`（原启发式判定改造而来）。
- `libScore` 加 `Python/Java/Rust + srcN>8 → 3`，保证 Python fixture 行为不变。
- `serverScoreV2` 带 `!hasFrontendSignal` 守卫，防前后端互吞。

### 3. REGEXES 正则集中管理
- 所有正则收入三层对象：顶层共享 / `util` 通用工具 / 18 套模板分组。
- 加载时 `checkRegexes` 递归自检：任一叶子不是 RegExp 实例就抛错，加载期即暴露"提前闭合/拼写退化成字符串"。

### 4. detectProfileHits 抽出 + __PA 扩展暴露
抽出 `detectProfileHits`（返回全部达标命中），供测试佐证"双方都达标"——避免"只有一方命中"的假绿。
`__PA` 新增暴露：`SCORE_REGISTRY / PRIORITY / REGEXES / 7 新 score 函数 / _detectProfileHits`。

## 测试工程

| 测试 | 项数 | 说明 |
|------|------|------|
| smoke | 全过 | 从硬编码 7 套 → 动态读 PROFILE_ORDER 覆盖 18 套；加 P1 结构断言 |
| **regex（新增）** | **94** | 自检 + 正例反例 + 18 套分组齐全 |
| logic | **322** | 新增 [17] 七组顺序负向断言（B1/B2 回归网） |
| scanner | 25 | 原样 |
| **合计** | **441 全绿** | |

### [17] 七组顺序负向断言（B1/B2 回归网）
每组构造"同时触发两个模板信号"的 fixture，用 `_detectProfileHits` 佐证**双方都≥3**（真考验，非一方命中），再断言赢家：
iac↔devops、desktop↔web、aiml↔data、microservice↔server、devops↔tool[B2回归]、game↔tool、cli↔tool。
其中 iac↔devops 刻意造**同分=3**（非具名 .tf + devops 三信号），才真正考 PRIORITY 同分裁决。

### 变异验证 5/5 被抓住
故意改坏核心逻辑，确认测试真有牙：
1. 交换 PRIORITY iac↔devops → 同分组 iac 改输 devops，logic 报警 ✓
2. gameScoreV2 永远返回 0 → game 识别失效，logic 报警 ✓
3. 排序比较器取反 → 高分不再优先，logic 大乱 ✓
4. toolScore 提前 return 0 → tool 识别失效，logic 报警 ✓
5. REGEXES 叶子退化成字符串 → checkRegexes + 测试自检双保险拦住 ✓

跑完删变异脚本，生产目录只留 index 级文件。

## 踩坑记录（已沉淀进 memory）
1. **同消息对同文件多 Edit 会冲突**：报"Successfully edited"但只落地一个。安全做法：一文件一 Edit。
2. **跨域 instanceof 坑**：REGEXES 在 vm 域创建，主域 `v instanceof RegExp` 恒 false（但 `re.test()` 跨域正常）。改用 `Object.prototype.toString.call(v) === "[object RegExp]"`。
3. **"PRIORITY 裁决"测试必须造同分**：高低优先级配对若分数不等，高分者凭分数赢，PRIORITY 没上场——测试形同虚设。变异验证会暴露弱 fixture。

## 提交
本地 git commit `381514a`（7 文件 +2255/-321）。**未打包 exe、未推送**——按你的要求，优化完你自己打包、自己用 GitHub Desktop 推。

## 后续（P2 演进，未做）
- 模板数据驱动化（PROFILES/advice/PHASE_FILE 模式一致，可减 ~483 行 / -21%）
- 历史快照 + 趋势对比（localStorage）——产品评审指出的唯一留存钩子
- 单文件 2700+ 行，接近拆分阈值，22 套模板时启动
