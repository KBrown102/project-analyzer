// 目录扫描。刻意不依赖 electron，这样能直接在 Node 里跑测试。
'use strict';

const path = require('path');
const fsp = require('fs/promises');

// —— 扫描上限：宁可少扫一点，也不要把界面卡死 ——
const MAX_DEPTH = 8;     // 最深钻到第 8 层
const MAX_FILES = 30000; // 路径列表上限
const MAX_TEXTS = 250;   // 最多读这么多个文本文件的内容
const MAX_SIZE = 300 * 1024;

// 与 project-analyzer.html 里的 NOISE 保持一致：这些目录根本不进去。
// 注意用正则而非精确名字——dist-out / out-xxx 这类变体也要跳过。
// tests/smoke.test.mjs 会核对两处的关键词是否一致，改一处记得改另一处。
const NOISE_DIR = /^(node_modules|\.git|\.svn|dist(-.*)?|build|win-unpacked|linux-unpacked|mac|nsis|portable|\.next|out(-.*)?|target|bin|obj|venv|__pycache__|\.idea|\.vscode|Library|Temp|Logs|release|\.cache|coverage|\.gradle|\.terraform|vendor)$/;

const TEXT_RE = /\.(md|markdown|json|ya?ml|txt|log|lua|js|mjs|cjs|py|gd|cs|ts|html|css|sh|toml|ini|cfg)$/i;

/**
 * 扫描目录。
 * 返回的路径形如 "项目名/src/main.js"——第一段固定是根目录名，
 * 分析器取 root 时直接 split("/")[0] 就行，和浏览器版的数据格式一致。
 * @returns {Promise<{root:string, base:string, paths:string[], texts:{path:string,text:string}[], truncated:boolean}>}
 */
async function scanDir(root) {
  const base = path.basename(root) || root;
  const paths = [];
  let truncated = false;

  async function walk(dir, depth) {
    if (depth > MAX_DEPTH || paths.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return; // 没权限、路径不存在等，跳过
    }
    for (const e of entries) {
      if (paths.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // 噪音目录直接不递归——这是相对浏览器版最大的优势
        if (NOISE_DIR.test(e.name)) continue;
        await walk(full, depth + 1);
      } else if (e.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        paths.push(base + '/' + rel);
      }
    }
  }

  await walk(root, 1);

  // 读文本内容：只挑小的文本文件，浅层优先（根目录的说明文档更有价值）
  const candidates = paths
    .filter((p) => TEXT_RE.test(p))
    .sort((a, b) => a.split('/').length - b.split('/').length)
    .slice(0, MAX_TEXTS);

  const texts = [];
  for (const rel of candidates) {
    const full = path.join(root, rel.slice(base.length + 1));
    try {
      const st = await fsp.stat(full);
      if (st.size >= MAX_SIZE) continue;
      texts.push({ path: rel, text: await fsp.readFile(full, 'utf8') });
    } catch {
      // 读不了就算了，不影响整体
    }
  }

  return { root, base, paths, texts, truncated };
}

module.exports = { scanDir, MAX_DEPTH, MAX_FILES, MAX_TEXTS, MAX_SIZE, NOISE_DIR, TEXT_RE };
