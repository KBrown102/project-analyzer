// 把 project-analyzer.html 里的 <script> 块抽出来，在 Node 的 vm 里跑一遍，
// 拿到它自己暴露的 window.__PA，就能对真实分析逻辑做断言，而不是对着源码字符串数数。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(__dirname, "..");

function mkEl(id) {
  return {
    id,
    value: "",
    className: "",
    textContent: "",
    innerHTML: "",
    onclick: null,
    onchange: null,
    children: [],
    handlers: {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
    click() {},
    select() {},
  };
}

/** 加载分析器，返回 { api, els, html }。api 即 window.__PA。 */
export function loadAnalyzer(htmlPath = path.join(root, "project-analyzer.html")) {
  const html = fs.readFileSync(htmlPath, "utf-8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("在 html 里找不到 <script> 块");

  const els = new Map();
  const document = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, mkEl(id));
      return els.get(id);
    },
    createElement(tag) { return mkEl(tag); },
  };
  const window = {};

  const ctx = vm.createContext({ document, window, console });
  vm.runInContext(m[1], ctx, { filename: "project-analyzer.html<script>" });

  if (!window.__PA) throw new Error("脚本跑完了但 window.__PA 没挂上");
  return { api: window.__PA, els, html, htmlPath };
}

/**
 * 造一个假文件对象，模拟 <input webkitdirectory> 给出的 File。
 * text 传 null 表示二进制文件（不进文本内容池）。
 */
export function fakeFile(relPath, text = "") {
  const name = relPath.split("/").pop();
  return {
    name,
    size: text == null ? 4096 : text.length,
    webkitRelativePath: relPath,
    text: () => Promise.resolve(text == null ? "" : text),
  };
}

/** 把 { "a/b.md": "内容" } 这样的表变成假文件数组。 */
export function fakeTree(tree) {
  return Object.keys(tree).map((p) => fakeFile(p, tree[p]));
}

/** 断言器，收集失败数。 */
export function createChecker(title) {
  const state = { pass: 0, fail: 0, failures: [] };
  console.log(`\n${title}`);
  return {
    state,
    ok(name, cond, extra) {
      if (cond) {
        state.pass += 1;
        console.log(`  ✓ ${name}`);
      } else {
        state.fail += 1;
        state.failures.push(name);
        console.error(`  ✗ ${name}${extra ? `  →  ${extra}` : ""}`);
      }
    },
    eq(name, actual, expected) {
      const cond = Object.is(actual, expected);
      this.ok(name, cond, cond ? "" : `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    },
  };
}
