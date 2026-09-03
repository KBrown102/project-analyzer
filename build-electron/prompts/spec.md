# AI 辅助分析 · 输出规范

## 每步校验（step-check）返回 JSON

```json
{
  "accuracy": "high | medium | low",
  "reason": "判定理由（简体中文，具体说明依据）",
  "canIgnore": true,
  "suggestion": "改进建议（可选，accuracy 为 low 时必填）"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| accuracy | string | 是 | "high" / "medium" / "low" 三选一 |
| reason | string | 是 | 判定理由，基于 data 事实，简体中文 |
| canIgnore | boolean | 是 | true=可忽略，false=需关注 |
| suggestion | string | 否 | 改进建议；accuracy 为 low 时必填 |

## 整体总结（summary）返回 JSON

```json
{
  "summary": "整体总结（简体中文，2-4 句话概括项目结构健康度）",
  "gaps": ["缺口1", "缺口2"],
  "suggestions": ["建议1", "建议2"]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| summary | string | 是 | 整体总结，2-4 句话，简体中文 |
| gaps | string[] | 是 | 缺口列表，每项一句话；无缺口时返回空数组 [] |
| suggestions | string[] | 是 | 改进建议列表，按优先级排序；无建议时返回空数组 [] |

## 输出约束

1. **只输出 JSON**，不要输出 JSON 以外的任何文字（不要包 ```json 围栏，不要解释）
2. JSON 必须合法可解析（双引号、无尾逗号）
3. 所有中文字符串不要转义为 \uXXXX，直接输出 UTF-8 中文
4. 如果无法判断（如信息不足），accuracy 返回 "medium"，reason 说明信息不足，canIgnore 返回 true
