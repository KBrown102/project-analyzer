// 真实行为测试：把 script 抽出来在 vm 里执行，喂假目录进去，断言分析结果。
// 与 smoke.test.mjs 的区别——这里测的是「分析得对不对」，不是「文件在不在」。
import fs from "node:fs";
import path from "node:path";
import { loadAnalyzer, fakeTree, createChecker, root } from "./_harness.mjs";

const { api } = loadAnalyzer();
const C = createChecker("Logic tests · 项目结构分析器（真实执行分析逻辑）");

// 直接从实现读，避免和 html 里的 PROFILE_ORDER 漂移（现已含 server 共 8 套）
const PROFILE_ORDER = api.PROFILE_ORDER;
const PRI_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** 跑一次完整分析，返回 buildData 的结果对象。 */
async function run(tree, label, profileId) {
  return api.analyze(fakeTree(tree), label, profileId || null);
}

// ── 假项目：一套模板一个，外加刻意造的边界情况 ──────────────────

const FIX = {
  // Godot 游戏 → game
  game: {
    "mygame/project.godot": 'config_version=5\n[application]\nrun/main_scene="res://src/main.tscn"',
    "mygame/README.md": "# 我的游戏\n\n一个横版动作游戏。",
    "mygame/design/gdd/core.md": "# GDD · 核心循环\n\n玩家在关卡中收集零件，躲避守卫。",
    "mygame/docs/architecture.md": "# 架构\n\n状态机 + ECS。",
    "mygame/src/player.gd": "extends KinematicBody2D\nfunc _process(d): pass\n",
    "mygame/.github/workflows/ci.yml": "name: CI\non: [push]\n",
  },

  // React Web 应用 → web
  web: {
    "app/package.json": JSON.stringify({ name: "app", dependencies: { react: "^18" } }),
    "app/README.md": "# App\n\n一个管理后台。",
    "app/pages/index.tsx": "export default function P(){ return <div>hi</div>; }\n",
    "app/src/App.tsx": "export default function App(){ return <div/>; }\n",
  },

  // 带 main/types 的 npm 包 → lib
  lib: {
    "mylib/package.json": JSON.stringify({ name: "mylib", main: "dist/index.js", types: "dist/index.d.ts" }),
    "mylib/README.md": "# mylib\n\n工具函数集合。",
    "mylib/CHANGELOG.md": "# Changelog\n\n## 1.0.0\n",
    "mylib/src/index.ts": "export function add(a,b){ return a+b; }\n",
    "mylib/dist/index.d.ts": "export declare function add(a: number, b: number): number;\n",
    "mylib/examples/demo.js": "const { add } = require('../dist/index.js');\n",
    "mylib/test/index.test.js": "test('add', () => {});\n",
  },

  // 单文件 HTML 小游戏 → mini
  mini: {
    "fish/index.html": [
      "<!DOCTYPE html><meta name='viewport' content='width=device-width'>",
      "<canvas id='c'></canvas><script>",
      "function loop(){ update(); requestAnimationFrame(loop); }",
      "addEventListener('pointerdown', start);",
      "var TXT_INTRO='怎么玩：点击水面投喂';",
      "var TXT_OVER='再来一次';",
      "</script>",
    ].join("\n"),
    "fish/README.md": "# 喂鱼\n\n点水面投喂。",
  },

  // python 小工具 → tool
  tool: {
    "mytool/run.bat": "@echo off\npython main.py\n",
    "mytool/README.md": "# mytool\n\n批量重命名工具。",
    "mytool/main.py": "import os\ndef main():\n    pass\n",
  },

  // Node Express 后端 → server（必须被判成 server 模板，而不是被 web/tool 抢走）
  server: {
    "api/package.json": JSON.stringify({ name: "api", dependencies: { express: "^4" } }),
    "api/README.md": "# 我的后端\n\n提供用户与订单接口。",
    "api/src/server.js": "const express = require('express');\nconst app = express();\napp.listen(3000);\n",
    "api/src/routes/users.js": "router.get('/users', list);\n",
    "api/src/models/user.js": "module.exports = { find() {} };\n",
    "api/.env.example": "PORT=3000\nDB_URL=sqlite://\n",
    "api/src/middleware/auth.js": "module.exports = (req,res,next)=>next();\n",
    "api/Dockerfile": "FROM node:18\nCMD node src/server.js\n",
    "api/test/server.test.js": "test('health', () => {});\n",
  },

  // 规则 / 文档仓库 → meta
  meta: {
    "myrules/README.md": "# 规则库\n\n团队约定集合。",
    "myrules/OVERVIEW.md": "# 总览\n\n这里沉淀所有约定。",
    "myrules/rules/naming.md": "# 命名约定\n",
    "myrules/references/ref-a.md": "# 参考 A\n",
    "myrules/design/design-b.md": "# 设计 B\n",
    "myrules/docs/doc-c.md": "# 文档 C\n",
  },

  // 一堆 C# 源码、没有 package.json / index.html → generic
  generic: {
    "myproj/README.md": "# myproj\n",
    "myproj/src/main.cs": "class Main {}\n",
    "myproj/src/util.cs": "class Util {}\n",
    "myproj/src/model.cs": "class Model {}\n",
    "myproj/src/view.cs": "class View {}\n",
    "myproj/src/ctrl.cs": "class Ctrl {}\n",
    "myproj/src/svc.cs": "class Svc {}\n",
    "myproj/src/dao.cs": "class Dao {}\n",
    "myproj/src/dto.cs": "class Dto {}\n",
    "myproj/src/api.cs": "class Api {}\n",
    "myproj/src/core.cs": "class Core {}\n",
  },

  // Terraform 基础设施即代码 → iac（硬标志物 *.tf，最先认，不被 server/generic 吞）
  iac: {
    "infra/README.md": "# 基础设施\n\n用 Terraform 管云上资源。",
    "infra/main.tf": 'resource "aws_vpc" "main" {}\n',
    "infra/variables.tf": 'variable "region" { default = "cn-north-1" }\n',
    "infra/outputs.tf": 'output "vpc_id" { value = aws_vpc.main.id }\n',
    "infra/modules/network/main.tf": 'resource "aws_subnet" "s" {}\n',
    "infra/modules/network/variables.tf": 'variable "cidr" {}\n',
    "infra/environments/prod/main.tf": 'module "network" { source = "../modules/network" }\n',
    "infra/environments/prod/backend.tfvars": 'bucket = "tf-state"\n',
  },

  // STM32 嵌入式固件 → embedded（CMake + HAL/BSP 分层 + 链接脚本 .ld）
  embedded: {
    "fw/README.md": "# 固件\n\n基于 STM32 的环境监测节点。",
    "fw/CMakeLists.txt": "cmake_minimum_required(VERSION 3.20)\n",
    "fw/Makefile": "all:\n\tarm-none-eabi-gcc $(SRC)\n",
    "fw/hal/gpio.c": "void gpio_init(void){}\n",
    "fw/hal/gpio.h": "#ifndef GPIO_H\n#define GPIO_H\n#endif\n",
    "fw/drivers/uart.c": "void uart_send(char c){}\n",
    "fw/drivers/uart.h": "#ifndef UART_H\n#define UART_H\n#endif\n",
    "fw/src/main.c": "int main(void){ gpio_init(); while(1){} }\n",
    "fw/src/main.h": "#ifndef MAIN_H\n#define MAIN_H\n#endif\n",
    "fw/linker/stm32.ld": "MEMORY { FLASH : ORIGIN = 0x08000000 }\n",
  },

  // Chrome MV3 插件 → extension（manifest MV3 + background/content/popup/icons）
  extension: {
    "ext/manifest.json": JSON.stringify({
      manifest_version: 3,
      name: "我的插件",
      version: "1.0.0",
      background: { service_worker: "background.js" },
      action: { default_popup: "popup/popup.html" },
      permissions: ["storage"],
    }),
    "ext/background.js": "chrome.runtime.onInstalled.addListener(()=>{});\n",
    "ext/content/inject.js": "console.log('injected');\n",
    "ext/popup/popup.html": "<!DOCTYPE html><body>弹窗</body></html>\n",
    "ext/popup/popup.js": "document.body.innerHTML='hi';\n",
    "ext/options/options.html": "<!DOCTYPE html><body>设置</body></html>\n",
    "ext/icons/icon16.png": null,
    "ext/icons/icon48.png": null,
    "ext/icons/icon128.png": null,
    "ext/README.md": "# 插件\n\n一个浏览器插件。",
  },

  // Airflow + 数仓分层 → data（dags/ + etl/ + warehouse ODS→DWD→DWS→ADS）
  data: {
    "pipe/README.md": "# 数据管道\n\nETL 与数仓。",
    "pipe/requirements.txt": "apache-airflow\npyspark\ndbt-core\n",
    "pipe/dags/etl_dag.py": "from airflow import DAG\ndef build(): pass\n",
    "pipe/etl/transform.py": "from pyspark.sql import SparkSession\nspark=SparkSession.builder.getOrCreate()\n",
    "pipe/warehouse/ods/raw_users.py": "rows=[]\n",
    "pipe/warehouse/dwd/dwd_users.py": "rows=[]\n",
    "pipe/warehouse/dws/dws_kpi.py": "rows=[]\n",
    "pipe/warehouse/ads/ads_kpi.py": "rows=[]\n",
    "pipe/spark/jobs/agg.py": "from pyspark.sql import SparkSession\n",
  },

  // Python 命令行工具 → cli（package.json bin + argparse + .sh，无后端分层）
  cli: {
    "tool/README.md": "# 命令行工具\n\n批量处理文件名。",
    "tool/package.json": JSON.stringify({ name: "renamer", bin: { renamer: "./cli.js" }, version: "1.0.0" }),
    "tool/cli.js": "const { program } = require('commander');\nprogram.parse(process.argv);\n",
    "tool/src/main.py": "import argparse\nparser=argparse.ArgumentParser()\n",
    "tool/run.sh": "#!/usr/bin/env bash\nnode cli.js \"$@\"\n",
  },

  // Electron 桌面应用 → desktop（electron 依赖 + main 进程，不能被 extension/web 抢）
  desktop: {
    "app/package.json": JSON.stringify({ name: "mdnote", main: "main.js", dependencies: { electron: "^28" } }),
    "app/README.md": "# 桌面应用\n\n一个 Markdown 编辑器。",
    "app/main.js": 'const { app, BrowserWindow } = require("electron");\nfunction create() {}\n',
    "app/renderer/index.html": "<!DOCTYPE html><body>编辑器</body></html>\n",
    "app/renderer/app.js": 'console.log("ui");\n',
  },

  // Android 原生应用 → mobile（AndroidManifest + res/，不被 server/generic 抢）
  mobile: {
    "app/AndroidManifest.xml": '<manifest package="com.example.todo"><application android:name=".App"></application></manifest>',
    "app/build.gradle": "android { compileSdk 34 }\n",
    "app/src/main/java/com/example/App.java": "package com.example;\npublic class App {}\n",
    "app/src/main/java/com/example/MainActivity.java": "public class MainActivity {}\n",
    "app/src/main/res/layout/activity_main.xml": "<LinearLayout></LinearLayout>\n",
    "app/src/main/res/values/strings.xml": '<resources><string name="app_name">Todo</string></resources>\n',
    "app/README.md": "# 安卓应用\n\n一个待办清单 App。",
  },

  // PyTorch 训练项目 → aiml（train.py + 权重 .pt + torch 依赖，不被 data 抢）
  aiml: {
    "ml/README.md": "# 训练\n\n图像分类模型。",
    "ml/requirements.txt": "torch\ntorchvision\n",
    "ml/train.py": "import torch\nmodel = torch.nn.Linear(10,2)\n",
    "ml/models/cnn.py": "import torch.nn as nn\nclass Net(nn.Module): pass\n",
    "ml/data/prepare.py": "def prepare(): pass\n",
    "ml/checkpoints/best.pt": null,
  },

  // CI + k8s 运维仓库 → devops（.github/workflows + Dockerfile + k8s，不被 tool 抢）
  devops: {
    "ops/README.md": "# 部署\n\n服务的 CI 与 k8s 清单。",
    "ops/.github/workflows/ci.yml": "name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
    "ops/Dockerfile": "FROM node:18\nCMD node server.js\n",
    "ops/k8s/deployment.yaml": "apiVersion: apps/v1\nkind: Deployment\n",
    "ops/helm/Chart.yaml": "apiVersion: v2\nname: mychart\n",
    "ops/scripts/deploy.sh": "#!/usr/bin/env bash\nkubectl apply -f k8s/\n",
  },

  // 多服务 Node 架构 → microservice（services/ 多个 + 网关 + proto，先于单 server 认）
  microservice: {
    "svc/README.md": "# 微服务项目\n\n订单与用户两个服务。",
    "svc/api-gateway/index.js": "const express=require('express');\n",
    "svc/api-gateway/package.json": JSON.stringify({ name: "gateway", dependencies: { express: "^4" } }),
    "svc/services/user/package.json": JSON.stringify({ name: "user", dependencies: { express: "^4" } }),
    "svc/services/user/src/server.js": "const express=require('express');\n",
    "svc/services/order/package.json": JSON.stringify({ name: "order", dependencies: { express: "^4" } }),
    "svc/services/order/src/server.js": "const express=require('express');\n",
    "svc/proto/order.proto": "syntax = 'proto3';\n",
    "svc/common/util.js": "module.exports = { id(){} };\n",
  },
};

// ── 1. 每套模板都能被自动识别出来 ──────────────────────────────
console.log("\n[1] 模板自动识别");
const detected = {};
for (const id of PROFILE_ORDER) {
  const d = await run(FIX[id], `auto-${id}`);
  detected[id] = d;
  C.eq(`${id} → profile`, d.profile, id);
}
C.ok(`${PROFILE_ORDER.length} 个 fixture 判出 ${PROFILE_ORDER.length} 种模板，无重复`,
  new Set(Object.values(detected).map((d) => d.profile)).size === PROFILE_ORDER.length,
  [...new Set(Object.values(detected).map((d) => d.profile))].join(","));

// ── 2. 类型识别 ────────────────────────────────────────────────
console.log("\n[2] 项目类型识别");
C.eq("Godot", detected.game.type, "Godot 游戏");
C.eq("前端工程", detected.web.type, "Node / 前端工程");
C.eq("Python", detected.tool.type, "Python 项目");
C.eq("规则仓库", detected.meta.type, "规则 / 文档仓库");
C.eq("HTML5 小游戏", detected.mini.type, "HTML5 网页项目");
C.eq("未识别", detected.generic.type, "未识别类型");
C.eq("后端", detected.server.type, "Node 后端服务");

// ── 2b. 服务端 / 后端识别（用户明确诉求：要能认出后端项目）────
console.log("\n[2b] 服务端 / 后端识别");
const SRV = {
  "node-express": {
    "be/package.json": JSON.stringify({ name: "be", dependencies: { express: "^4" } }),
    "be/src/server.js": "const express=require('express');\n",
    "be/src/routes/users.js": "router.get('/users');\n",
  },
  "python-fastapi": {
    "be/requirements.txt": "fastapi\nuvicorn\n",
    "be/main.py": "from fastapi import FastAPI\n",
    "be/routes/users.py": "def list_users():\n    pass\n",
  },
  "java-spring": {
    "svc/pom.xml": "<project></project>\n",
    "svc/src/main/java/com/App.java": "class App {}\n",
    "svc/src/main/java/com/controller/UserController.java": "class UserController {}\n",
  },
  "go-service": {
    "gsvc/go.mod": "module gsvc\n",
    "gsvc/cmd/server.go": "package main\n",
    "gsvc/internal/handler/user.go": "package handler\n",
  },
};
for (const [k, tree] of Object.entries(SRV)) {
  const d = await run(tree, "srv-" + k);
  C.eq(`${k} 判成 server 模板`, d.profile, "server");
  C.ok(`${k} 不是 generic 兜底`, d.profile !== "generic");
}
// 对照组：前端 / 库 不能误判成后端
const react = await run({
  "fe/package.json": JSON.stringify({ name: "fe", dependencies: { react: "^18" } }),
  "fe/src/App.tsx": "export default ()=><div/>;\n",
  "fe/src/pages/home.tsx": "export default ()=><div/>;\n",
}, "srv-react");
C.ok("React 前端不误判为 server", react.profile !== "server");
C.eq("React 判成 web", react.profile, "web");

const npmLib = await run({
  "lib/package.json": JSON.stringify({ name: "lib", main: "dist/index.js", types: "dist/index.d.ts" }),
  "lib/src/index.ts": "export function add(a:number,b:number){return a+b;}\n",
}, "srv-lib");
C.ok("npm 库不误判为 server", npmLib.profile !== "server");
C.eq("npm 库判成 lib", npmLib.profile, "lib");

// ── 2c. 新增 5 类硬核模板识别（用户诉求：插件/CLI/嵌入式/IaC/数据工程）────
console.log("\n[2c] 硬核 5 类识别");
C.eq("IaC", detected.iac.type, "基础设施即代码");
C.eq("嵌入", detected.embedded.type, "嵌入式固件");
C.eq("插件", detected.extension.type, "浏览器插件");
C.eq("数据", detected.data.type, "数据工程项目");
C.eq("CLI", detected.cli.type, "命令行工具");
// 对照组：React 前端不能误判成这 5 类里的任何一类
C.ok("React 前端不是 IaC", detected.web.profile !== "iac");
C.ok("React 前端不是嵌入式", detected.web.profile !== "embedded");
C.ok("React 前端不是插件", detected.web.profile !== "extension");
C.ok("React 前端不是数据工程", detected.web.profile !== "data");
C.ok("React 前端不是 CLI", detected.web.profile !== "cli");
C.eq("React 前端仍判 web", detected.web.profile, "web");
// 对照组：Node 后端不能误判成 IaC / 数据工程
C.ok("Express 后端不是 IaC", detected.server.profile !== "iac");
C.ok("Express 后端不是数据工程", detected.server.profile !== "data");

// ── 2c2. 第二批 5 类模板识别（桌面/移动/AI·ML/DevOps/微服务）────
console.log("\n[2c2] 第二批 5 类识别");
C.eq("桌面", detected.desktop.type, "桌面应用");
C.eq("移动", detected.mobile.type, "移动原生应用");
C.eq("AI", detected.aiml.type, "AI / 机器学习项目");
C.eq("DevOps", detected.devops.type, "DevOps / CI 工程");
C.eq("微服务", detected.microservice.type, "微服务架构");
C.eq("桌面 profile", detected.desktop.profile, "desktop");
C.eq("移动 profile", detected.mobile.profile, "mobile");
C.eq("AI profile", detected.aiml.profile, "aiml");
C.eq("DevOps profile", detected.devops.profile, "devops");
C.eq("微服务 profile", detected.microservice.profile, "microservice");
// 对照组：React 前端 / Express 后端 不能误判成这 5 类里的任何一类
C.ok("React 前端不是桌面", detected.web.profile !== "desktop");
C.ok("React 前端不是移动", detected.web.profile !== "mobile");
C.ok("React 前端不是 AI", detected.web.profile !== "aiml");
C.ok("React 前端不是 DevOps", detected.web.profile !== "devops");
C.ok("React 前端不是微服务", detected.web.profile !== "microservice");
C.ok("Express 后端不是 DevOps", detected.server.profile !== "devops");
C.ok("Express 后端不是微服务", detected.server.profile !== "microservice");
C.ok("Express 后端不是桌面", detected.server.profile !== "desktop");
C.ok("Express 后端不是移动", detected.server.profile !== "mobile");
C.ok("Express 后端不是 AI", detected.server.profile !== "aiml");

// ── 3. 结果结构完整性 ──────────────────────────────────────────
console.log("\n[3] 结果结构");
const d0 = detected.game;
["label", "root", "name", "files", "dirs", "exts", "profile", "profileName", "profileTag",
  "auto", "type", "phases", "artifacts", "eng", "has", "intro", "advice"].forEach((k) => {
  C.ok(`d.${k} 存在`, d0[k] !== undefined && d0[k] !== null);
});
C.eq("root 取的是顶层目录名", d0.root, "mygame");
C.ok("root 不含斜杠", !d0.root.includes("/"));
C.ok("exts 是 {ext,n} 数组且按数量降序",
  Array.isArray(d0.exts) && d0.exts.every((e) => e.ext && typeof e.n === "number") &&
  d0.exts.every((e, i) => i === 0 || d0.exts[i - 1].n >= e.n));
C.ok("has 映射与 artifacts 一致",
  d0.artifacts.every((a) => d0.has[a.key] === a.has));
C.ok("intro 有 title 字段", typeof d0.intro.title === "string");
C.ok("dirs 统计出了子目录", d0.dirs >= 3, `实际 ${d0.dirs}`);

// ── 4. 阶段链 ──────────────────────────────────────────────────
console.log("\n[4] 阶段链推进");
const ph = detected.game.phases;
C.ok("list 长度等于模板阶段数",
  ph.list.length === api.PROFILES.game.phases.length, `实际 ${ph.list.length}`);
const byName = (n) => ph.list.find((p) => p.name === n);
C.ok("系统设计 已完成（design/gdd 命中）", byName("系统设计").done, JSON.stringify(byName("系统设计")));
C.ok("技术搭建 已完成（docs/architecture 命中）", byName("技术搭建").done);
C.ok("制作 已完成（src/ 命中）", byName("制作").done);
C.ok("概念 未完成（没写立项文档）", !byName("概念").done);
C.ok("发布 未完成", !byName("发布").done);
C.eq("lastDone = 制作(5)", ph.lastDone, 5);
C.eq("cur 指向打磨(6)", ph.cur, 6);
C.ok("cur 标记只落在一个阶段上",
  ph.list.filter((p) => p.cur).length === 1);
C.ok("已完成阶段都带证据路径",
  ph.list.filter((p) => p.done).every((p) => typeof p.evidence === "string" && p.evidence.length > 0));
C.ok("未完成阶段 evidence 为 null",
  ph.list.filter((p) => !p.done).every((p) => p.evidence === null));

// ── 5. 产物清单 ────────────────────────────────────────────────
console.log("\n[5] 产物清单");
const art = detected.mini.artifacts;
const artBy = (k) => art.find((a) => a.key === k);
C.ok("入口 index.html 命中", artBy("ENTRY").has);
C.ok("开始页说明 命中（正文含『怎么玩』）", artBy("INTRO").has);
C.ok("体验闭环 命中（正文含『再来一次』）", artBy("LOOP").has);
C.ok("帧率控制 命中（requestAnimationFrame）", artBy("PERF").has);
C.ok("移动端适配 命中（viewport）", artBy("RESP").has);
C.ok("零外部依赖 命中（neg 项：正文没有 CDN 链接）", artBy("SELF").has);

const cdnTree = {
  "cdnapp/index.html": "<canvas></canvas><script src='https://cdn.jsdelivr.net/npm/x@1'></script>",
};
const dCdn = await run(cdnTree, "cdn");
C.ok("引了 CDN 时 零外部依赖 判定为缺失（neg 生效）",
  dCdn.artifacts.find((a) => a.key === "SELF").has === false);

// neg 字段不能被搞反：每个 neg 项的 has 必须与 evidence 相反
console.log("\n[5b] neg 语义");
let negChecked = 0;
for (const id of PROFILE_ORDER) {
  const pr = api.getProfile(id);
  pr.artifacts.filter((a) => a.neg).forEach((a) => {
    const got = detected[id].artifacts.find((x) => x.key === a.key);
    negChecked += 1;
    C.ok(`${id}.${a.key} neg 语义正确（命中=缺失）`, got.has === !got.evidence);
  });
}
C.ok(`至少覆盖到 ${negChecked} 个 neg 项`, negChecked >= 1);

// ── 6. 强制换模板 ──────────────────────────────────────────────
console.log("\n[6] 强制指定模板");
C.eq("强制 game 生效", (await run(FIX.game, "force-1", "web")).profile, "web");
C.eq("强制 meta 生效", (await run(FIX.web, "force-2", "meta")).profile, "meta");
C.ok("auto 字段仍记录自动判定结果",
  (await run(FIX.web, "force-3", "meta")).auto === "web");

// buildData 不重读文件，直接按缓存重算
const reGame = api.buildData("force-1", "game");
C.eq("buildData 换模板后 profile 跟着变", reGame.profile, "game");
C.ok("buildData 结果仍是完整对象",
  reGame && reGame.phases && reGame.artifacts && Array.isArray(reGame.advice));

// ── 7. advice 输出 ─────────────────────────────────────────────
console.log("\n[7] advice 建议");
for (const id of PROFILE_ORDER) {
  const d = detected[id];
  const adv = d.advice;
  C.ok(`${id} advice 是数组`, Array.isArray(adv));
  C.ok(`${id} advice 每项字段齐全`,
    adv.every((a) => a.pri && a.tag && a.title && a.detail && a.why));
  C.ok(`${id} advice 按优先级排序`,
    adv.every((a, i) => i === 0 || PRI_ORDER[adv[i - 1].pri] <= PRI_ORDER[a.pri]));
  C.ok(`${id} advice 无重复标题`,
    new Set(adv.map((a) => a.title)).size === adv.length);
}

// 空项目应当给出大量建议，且必须包含 P0 的 README
const bare = await run({ "bare/src/a.js": "var a=1;\n" }, "bare");
C.ok("极简项目有建议输出", bare.advice.length > 0);
C.ok("缺 README 时给出 P0 建议",
  bare.advice.some((a) => a.pri === "P0" && /README/.test(a.title)));

// 上面那批 fixture 的 advice 恰好本来就有序，排序断言形同虚设。
// 这个是刻意造的乱序样本：phaseGap 先产出 P1/P2，README 的 P0 排在后面，
// 只有 sortAdv 真的生效，P0 才会跑到最前面。
const unsorted = await run({
  "g2/project.godot": "config_version=5\n",
  "g2/design/gdd/core.md": "# GDD\n",
  "g2/docs/architecture.md": "# 架构\n",
  "g2/src/player.gd": "extends Node\n",
}, "unsorted");
C.eq("乱序样本判为 game", unsorted.profile, "game");
C.ok("乱序样本确实会产出 P0 与 P2 建议",
  unsorted.advice.some((a) => a.pri === "P0") && unsorted.advice.some((a) => a.pri === "P2"));
C.eq("P0 被排到最前（sortAdv 生效）", unsorted.advice[0].pri, "P0");
C.ok("整条建议单调不降",
  unsorted.advice.every((a, i) => i === 0 || PRI_ORDER[unsorted.advice[i - 1].pri] <= PRI_ORDER[a.pri]),
  JSON.stringify(unsorted.advice.map((a) => a.pri)));

// ── 8. NOISE 过滤 ──────────────────────────────────────────────
console.log("\n[8] 噪声目录过滤");
const noisy = await run({
  "app/README.md": "# app\n",
  "app/src/main.js": "var a=1;\n",
  "app/node_modules/dep/index.js": "module.exports=1;\n",
  "app/node_modules/dep/sub/deep.js": "module.exports=2;\n",
  "app/.git/config": "[core]\n",
  "app/dist/bundle.js": "var b=1;\n",
}, "noisy");
C.eq("node_modules / .git / dist 全被过滤，只剩 2 个文件", noisy.files, 2);

const allNoise = await run({
  "app/node_modules/dep/index.js": "module.exports=1;\n",
}, "all-noise");
C.eq("全是噪声目录时 analyze 返回 null", allNoise, null);

const emptyList = await api.analyze([], "empty");
C.eq("空文件列表返回 null", emptyList, null);

// 已知边界：NOISE 按「路径任意一段」匹配，顶层目录名本身撞上噪声词时整棵都会没掉。
// 这里不是断言它「应该」这样，而是把这个行为钉住——哪天改了正则，测试会提醒你复查。
const topNoise = await run({
  "dist/README.md": "# 我的顶层目录就叫 dist\n",
  "dist/src/main.js": "var a=1;\n",
}, "top-noise");
C.eq("顶层目录名撞噪声词 → 整棵被过滤，返回 null", topNoise, null);

// ── 9. 工程化指标 ──────────────────────────────────────────────
console.log("\n[9] 工程化指标");
C.ok("game 有 CI", detected.game.eng.ci === true);
C.ok("game 无测试", detected.game.eng.test === 0);
C.ok("lib 有测试", detected.lib.eng.test >= 1);
C.ok("web 读到 package.json", detected.web.eng.pkg === true);
C.eq("web 依赖数", detected.web.eng.deps, 1);
C.ok("game 有 README", detected.game.eng.readme === true);
C.ok("tool 无 CI", detected.tool.eng.ci === false);

// ── 10. 鲁棒性：畸形输入不能抛 ─────────────────────────────────
console.log("\n[10] 鲁棒性");
const brokenPkg = await run({
  "bad/package.json": "{ 这不是合法 JSON ]]]",
  "bad/README.md": "# bad\n",
  "bad/index.html": "<html><body>hi</body></html>",
}, "bad-json");
C.ok("非法 package.json 不抛异常且仍出结果", brokenPkg && brokenPkg.profile);
C.ok("非法 package.json 时 scripts 为空数组",
  Array.isArray(brokenPkg.eng.scripts) && brokenPkg.eng.scripts.length === 0);

const weird = await run({
  "w/文件 名 with space.md": "# 空格与中文路径\n",
  "w/UPPER.MD": "# 大写扩展名\n",
  "w/no-ext": "没有扩展名的文件",
  "w/.hidden": "隐藏文件",
}, "weird");
C.ok("中文/空格/无扩展名/隐藏文件 不抛异常", weird !== null);
C.ok("大写 .MD 也计入 md", weird.exts.some((e) => e.ext === "md"));

// 注意：顶层目录别叫 bin/dist/build —— 那会整棵撞上 NOISE 规则（见 [8b]）
const binaryOnly = await run({
  "media/logo.png": null,
  "media/README.md": "# 只有二进制和一行说明\n",
}, "media");
C.ok("二进制文件不进文本池也能分析", binaryOnly !== null);
C.eq("二进制目录只统计到 2 个文件", binaryOnly.files, 2);

// 单文件项目
const single = await run({ "one/main.js": "console.log(1);\n" }, "single");
C.ok("单文件项目不崩", single !== null && typeof single.profile === "string");

// ── 11. 逐模板强制跑通（换模板不能某套炸掉）──────────────────
console.log("\n[11] 所有 fixture × 所有模板 交叉跑通");
let cross = 0, crossFail = 0;
for (const fid of Object.keys(FIX)) {
  for (const pid of PROFILE_ORDER) {
    try {
      const d = api.buildData(`auto-${fid}`, pid);
      if (!d || d.profile !== pid) throw new Error(`profile 应为 ${pid}，实际 ${d && d.profile}`);
      if (!Array.isArray(d.advice)) throw new Error("advice 不是数组");
      cross += 1;
    } catch (e) {
      crossFail += 1;
      console.error(`  ✗ ${fid} × ${pid}: ${e.message}`);
    }
  }
}
C.eq(`${Object.keys(FIX).length} fixture × ${PROFILE_ORDER.length} 模板 = ${Object.keys(FIX).length * PROFILE_ORDER.length} 组合全部跑通`, crossFail, 0);
C.ok(`实际跑了 ${cross} 个组合`, cross === Object.keys(FIX).length * PROFILE_ORDER.length);

// ── 12. 两份 html 必须一致（electron 打包用的是副本）──────────
console.log("\n[12] 打包副本同步");
const a = fs.readFileSync(path.join(root, "project-analyzer.html"), "utf-8");
const b = fs.readFileSync(path.join(root, "build-electron", "project-analyzer.html"), "utf-8");
C.ok("build-electron/project-analyzer.html 与根文件一致", a === b,
  a === b ? "" : `根 ${a.length} 字节 vs 副本 ${b.length} 字节`);

// ── 14. 项目边界识别 ───────────────────────────────────────────
console.log("\n[14] 项目边界识别");

// 一个工作区：顶层只有散碎文件，两个真项目在子目录里，
// 外加一个纯文档目录（不该被当成项目）
const WS = {
  "workspace/README.md": "# 我的工作区\n",
  "workspace/随手记.md": "# 随手记\n",
  "workspace/antgame/package.json": '{"name":"antgame","dependencies":{"pixi":"^7"}}',
  "workspace/antgame/src/main.js": 'import PIXI from "pixi";\n',
  "workspace/antgame/README.md": "# 蚂蚁沙盒\n",
  "workspace/webtool/index.html": "<canvas></canvas><script>requestAnimationFrame(loop)</script>",
  "workspace/webtool/README.md": "# 小工具\n",
  "workspace/notes/a.md": "# A\n",
  "workspace/notes/b.md": "# B\n",
  "workspace/notes/c.md": "# C\n",
  "workspace/notes/d.md": "# D\n",
};

const wsD = await run(WS, "ws");
const bnd = wsD.boundary;
C.ok("工作区 不是单项目", bnd.isSingle === false);
C.eq("识别出 2 个子项目", bnd.projects.length, 2);
C.eq("子项目是 antgame 与 webtool",
  bnd.projects.map((p) => p.name).sort().join(","), "antgame,webtool");
C.ok("纯文档的 notes/ 没被当成项目", !bnd.projects.some((p) => p.name === "notes"));
C.ok("每个子项目都带 kind 和文件数",
  bnd.projects.every((p) => p.kind && typeof p.files === "number"));
C.ok("子项目按得分降序",
  bnd.projects.every((p, i) => i === 0 || bnd.projects[i - 1].score >= p.score));
C.ok("reason 里说明了找到几个", /2 个候选/.test(bnd.reason), bnd.reason);
// kind 必须验：光断言「识别出来了」不够——靠弱信号也能识别，但类型会退化成「未识别」
C.eq("antgame 认出是 Node 项目",
  bnd.projects.find((p) => p.name === "antgame").kind, "Node / 前端");
C.eq("webtool 认出是网页项目",
  bnd.projects.find((p) => p.name === "webtool").kind, "网页 / 单文件");

// 顶层自带 manifest → 就是单项目，不该弹提示
const solo = await run({
  "myapp/package.json": '{"main":"x.js"}',
  "myapp/src/a.js": "var a=1;\n",
  "myapp/README.md": "# app\n",
}, "solo");
C.ok("顶层有 package.json → 判定为单项目", solo.boundary.isSingle === true);
C.eq("单项目时 projects 为空", solo.boundary.projects.length, 0);
C.ok("reason 指出是标志物", /标志物/.test(solo.boundary.reason), solo.boundary.reason);

// 谁都不像项目
const junk = await run({ "junk/图片 1.png": null, "junk/说明.txt": "随便放的东西\n" }, "junk");
C.ok("没有标志物时 isSingle=false", junk.boundary.isSingle === false);
C.eq("没有标志物时 projects 为空", junk.boundary.projects.length, 0);
C.ok("reason 提示可能只是普通文件夹", /普通文件夹/.test(junk.boundary.reason), junk.boundary.reason);

console.log("\n[14b] 各类项目标志物");
const manifestCases = [
  ["package.json", "Node / 前端"],
  ["pyproject.toml", "Python"],
  ["Cargo.toml", "Rust"],
  ["go.mod", "Go"],
  ["pom.xml", "Java"],
  ["app.sln", ".NET"],
  ["project.godot", "Godot"],
  ["game.uproject", "Unreal"],
  ["composer.json", "其他"],
];
// manifest 必须放在子目录里：放顶层的话整层就会被判成单项目，projects 是空的
for (const [file, kind] of manifestCases) {
  const d = await run({
    ["hub/proj/" + file]: "x\n",
    "hub/proj/README.md": "# p\n",
    "hub/proj/src/main.js": "var a=1;\n",
  }, "m-" + file);
  C.ok(`${file} 所在目录被识别为项目`, d.boundary.projects.length === 1,
    `实际 ${d.boundary.projects.length} 个`);
  const p = d.boundary.projects[0];
  C.ok(`${file} → ${kind}`, p && p.kind === kind, p ? p.kind : "未识别");
}

// ── 15. 切换子项目（scope）────────────────────────────────────
console.log("\n[15] 切换子项目");
const subGame = api.buildData("ws", null, "workspace/antgame");
C.ok("切到子项目后能出结果", subGame !== null);
C.eq("子项目 name 取最后一段", subGame.name, "antgame");
C.eq("子项目只统计自己的文件", subGame.files, 3);
C.ok("子项目 root 仍记着顶层目录", subGame.root === "workspace");
C.eq("scope 字段被记录", subGame.scope, "workspace/antgame");
C.ok("子项目单独判出了游戏类型", /游戏/.test(subGame.type), subGame.type);

const subTool = api.buildData("ws", null, "workspace/webtool");
C.eq("webtool 单独分析只有 2 个文件", subTool.files, 2);
C.eq("webtool 判成小游戏模板", subTool.profile, "mini");

const whole = api.buildData("ws", null, null);
C.eq("scope 为空时回到整个目录", whole.files, 11);
C.eq("scope 为空时 scope 字段为 null", whole.scope, null);
C.eq("不存在的 scope 返回 null", api.buildData("ws", null, "workspace/nope"), null);
C.ok("切子项目不污染顶层结果", api.buildData("ws", null, null).type === wsD.type);

// ── 16. 导出提示词 ─────────────────────────────────────────────
console.log("\n[16] 导出提示词");
const pd = await run({
  "myapp/package.json": '{"main":"x.js"}',
  "myapp/src/a.js": "var a=1;\n",
}, "prompt");
const full = api.genPrompt(pd);
C.ok("提示词非空", full.length > 200);
["## 一、项目概况", "## 二、流程进度", "## 三、产物齐全度",
  "## 四、需要补齐的缺口", "## 五、我希望你做这些"].forEach((sec) => {
  C.ok(`包含 ${sec}`, full.includes(sec));
});
C.ok("包含项目名称", full.includes("myapp"));
C.ok("包含分析模板", full.includes(pd.profileName));
C.ok("产物表格有分隔行", full.includes("| --- | --- | --- |"));
C.ok("默认全选时建议全都在", pd.advice.every((a) => full.includes(a.title)));
C.ok("每条建议带「该做什么」", pd.advice.every((a) => full.includes(a.detail)));
C.ok("每条建议带「为什么」", pd.advice.every((a) => full.includes(a.why)));

if (pd.advice.length >= 2) {
  api._setSel("prompt", pd.advice.map((a, i) => i === 0));
  const one = api.genPrompt(pd);
  C.ok("只勾第一项时它还在", one.includes(pd.advice[0].title));
  C.ok("未勾选项的标题不出现", !one.includes(pd.advice[1].title));
  C.ok("未勾选项的 detail 也不出现", !one.includes(pd.advice[1].detail));

  api._setSel("prompt", pd.advice.map(() => false));
  const none = api.genPrompt(pd);
  C.ok("全不选时有兜底文案", /一项都没勾选/.test(none));
  C.ok("全不选时不输出任何建议标题", pd.advice.every((a) => !none.includes(a.title)));
}
api._setSel("prompt", pd.advice.map(() => true));
const grouped = api.genPrompt(pd);
pd.advice.forEach((a) => {
  C.ok(`优先级分组 ${a.pri} 标题存在`, grouped.includes("### " + a.pri + "（"));
});

const subPrompt = api.genPrompt(subGame);
C.ok("子项目提示词标注了来源路径", subPrompt.includes("workspace/antgame"));

// ── 13. 导出的 API 契约 ────────────────────────────────────────
console.log("\n[13] window.__PA 契约");
["analyze", "buildData", "detectType", "detectProfile", "detectPhases", "detectArtifacts",
  "detectEngineering", "genIntro", "inferModules", "PROFILES", "getProfile",
  "detectProjects", "scoreDir", "genPrompt"].forEach((k) => {
  C.ok(`__PA.${k} 已暴露`, api[k] !== undefined);
});
C.eq("PROFILES 套数 = PROFILE_ORDER", Object.keys(api.PROFILES).length, PROFILE_ORDER.length);
C.ok("getProfile 未知 id 回落 generic", api.getProfile("__nope__").id === "generic");

// ── 17. 打分排序消除顺序依赖（7 组负向断言）────────────────────
// 每组构造「同时触发两个模板信号」的 fixture，用 _detectProfileHits 佐证双方都达标(>=3)，
// 再断言 PRIORITY 高的赢。这是 B1/B2 类 bug 的回归网：
// SCORE_REGISTRY 顺序或 PRIORITY 一改坏就立刻报警。
console.log("\n[17] 打分排序 · 顺序无关性（7 组负向）");

// 从假目录重建 analyze 内部传给 detectProfile 的 (paths, texts, type)，供直接读命中表。
// fixture 无噪声目录 → paths=全部键、texts=非空文本项，type 取 analyze 结果。
function probe(tree, type) {
  const paths = Object.keys(tree);
  const texts = Object.keys(tree).filter((k) => tree[k] != null)
    .map((k) => ({ path: k, text: String(tree[k]) }));
  return api._detectProfileHits(paths, texts, type);
}
const hitScore = (hits, id) => (hits.find((h) => h.id === id) || { score: 0 }).score;

const ORDER = {
  "iac(16) vs devops(7)": {
    // 刻意造同分=3：iac 用非具名 .tf（只 +3，不触发 main/variables 的 +1）；
    // devops 用 ci+Dockerfile+deploy.sh（各 +1=3），且 deploy.sh 不含 kubectl 等关键词（否则文本 +1 变 4）。
    // 同分时 iac 靠 PRIORITY 16 > devops 7 赢——这才是 PRIORITY 裁决的真考验。
    tree: {
      "infra/network.tf": 'resource "aws_vpc" "main" {}\n',
      "infra/storage.tf": 'resource "aws_s3_bucket" "b" {}\n',
      "infra/.github/workflows/ci.yml": "name: CI\non: [push]\n",
      "infra/Dockerfile": "FROM node:18\n",
      "infra/scripts/deploy.sh": "#!/usr/bin/env bash\necho deploy\n",
      "infra/README.md": "# 基础设施\n",
    },
    a: "iac", b: "devops", expect: "iac",
  },
  "desktop(12) vs web(2)": {
    tree: {
      "app/package.json": JSON.stringify({ name: "note", main: "main.js", dependencies: { electron: "^28" } }),
      "app/main.js": 'const { app, BrowserWindow } = require("electron");\n',
      "app/pages/home.tsx": "export default ()=><div/>;\n",
      "app/renderer/index.html": "<!DOCTYPE html><body>hi</body></html>\n",
      "app/README.md": "# 桌面\n",
    },
    a: "desktop", b: "web", expect: "desktop",
  },
  "aiml(11) vs data(9)": {
    tree: {
      "ml/train.py": "import torch\nmodel = torch.nn.Linear(10,2)\n",
      "ml/requirements.txt": "torch\ntorchvision\n",
      "ml/checkpoints/best.pt": null,
      "ml/dags/etl_dag.py": "from airflow import DAG\n",
      "ml/warehouse/ods/raw.py": "rows=[]\n",
      "ml/warehouse/dwd/dwd.py": "rows=[]\n",
      "ml/README.md": "# ML\n",
    },
    a: "aiml", b: "data", expect: "aiml",
  },
  "microservice(10) vs server(8)": {
    tree: {
      "svc/api-gateway/index.js": "const express=require('express');\n",
      "svc/services/user/package.json": JSON.stringify({ name: "user", dependencies: { express: "^4" } }),
      "svc/services/user/src/server.js": "const express=require('express');\n",
      "svc/services/order/package.json": JSON.stringify({ name: "order", dependencies: { express: "^4" } }),
      "svc/services/order/src/server.js": "const express=require('express');\n",
      "svc/proto/order.proto": "syntax='proto3';\n",
      "svc/README.md": "# 微服务\n",
    },
    a: "microservice", b: "server", expect: "microservice",
  },
  "devops(7) vs tool(1) [B2 回归]": {
    tree: {
      "ops/.github/workflows/ci.yml": "name: CI\non: [push]\n",
      "ops/Dockerfile": "FROM node:18\n",
      "ops/scripts/deploy.sh": "#!/usr/bin/env bash\nkubectl apply -f k8s/\n",
      "ops/k8s/deployment.yaml": "apiVersion: apps/v1\n",
      "ops/README.md": "# 部署\n",
    },
    a: "devops", b: "tool", expect: "devops",
  },
  "game(100) vs tool(1)": {
    tree: {
      "mygame/project.godot": 'config_version=5\n[application]\nrun/main_scene="res://main.tscn"\n',
      "mygame/README.md": "# 游戏\n",
      "mygame/docs/arch.md": "# 架构\n",
      "mygame/src/player.gd": "extends Node2D\n",
    },
    a: "game", b: "tool", expect: "game",
  },
  "cli(6) vs tool(1)": {
    tree: {
      "tool/package.json": JSON.stringify({ name: "r", bin: { r: "./cli.js" } }),
      "tool/cli.js": "const {program}=require('commander');program.parse(process.argv);\n",
      "tool/src/main.py": "import argparse\n",
      "tool/run.sh": "#!/usr/bin/env bash\nnode cli.js\n",
      "tool/README.md": "# CLI\n",
    },
    a: "cli", b: "tool", expect: "cli",
  },
};

for (const [name, { tree, a, b, expect: exp }] of Object.entries(ORDER)) {
  const d = await run(tree, "order-" + name.replace(/\W+/g, "-"));
  const hits = probe(tree, d.type);
  C.ok(`${name}：双方 ${a} 与 ${b} 都达标(>=3)`,
    hitScore(hits, a) >= 3 && hitScore(hits, b) >= 3,
    `${a}=${hitScore(hits, a)} ${b}=${hitScore(hits, b)}（必须双方都达标才算真考验）`);
  C.eq(`${name}：裁决为 ${exp}（PRIORITY 高者赢）`, d.profile, exp);
}

// ── [18] 历史快照留存钩子（P2 方向 1）─────────────────────────
console.log("\n[18] 历史快照留存钩子");
(function () {
  api.clearHistory(); // setup：清空，避免被前面段污染

  function fakeData(name, type, profile) {
    return {
      label: "A", root: name, name: name, files: 42, dirs: 5, exts: [],
      profile: profile, profileName: profile.toUpperCase(), profileTag: "",
      auto: profile, type: type, source: "browser", truncated: false,
      boundary: null,
      phases: { list: [{ done: true }, { done: false }, { done: true }] }, // 2/3
      artifacts: [{ has: true }, { has: false }, { has: true }, { has: true }], // 3/4
      eng: [], has: {}, intro: "", advice: ""
    };
  }

  // 1. __PA 暴露齐全
  C.ok("HISTORY_KEY 暴露为非空字符串", typeof api.HISTORY_KEY === "string" && api.HISTORY_KEY.length > 0);
  C.ok("MAX_HISTORY=20", api.MAX_HISTORY === 20);
  C.ok("HAS_LS=true（harness 已注入 localStorage mock）", api.HAS_LS === true);
  ["saveHistory", "listHistory", "deleteHistory", "clearHistory", "snapshotFromData", "updateHistoryBadge"]
    .forEach((fn) => C.ok(fn + " 是函数", typeof api[fn] === "function"));

  // 2. 存档后能查到 + 摘要字段齐全
  api.clearHistory();
  var snap = api.saveHistory(fakeData("proj-a", "node", "web"));
  C.ok("saveHistory 返回快照对象", snap && typeof snap === "object");
  C.ok("快照 id 是数字", typeof snap.id === "number");
  C.ok("快照 ts 是字符串", typeof snap.ts === "string" && /\d/.test(snap.ts));
  var arr1 = api.listHistory();
  C.ok("存档后 listHistory 长度=1", arr1.length === 1, "实际 " + arr1.length);
  C.ok("快照 name=proj-a", arr1[0].name === "proj-a");
  C.ok("快照 files=42", arr1[0].files === 42);
  C.ok("快照 type=node", arr1[0].type === "node");
  C.ok("快照 profile=web", arr1[0].profile === "web");
  C.ok("快照 phaseDone/Total=2/3", arr1[0].phaseDone === 2 && arr1[0].phaseTotal === 3);
  C.ok("快照 artifactDone/Total=3/4", arr1[0].artifactDone === 3 && arr1[0].artifactTotal === 4);
  C.ok("快照 truncated=false", arr1[0].truncated === false);

  // 3. 容量管理：超 20 滚动删最旧
  api.clearHistory();
  for (var i = 0; i < 25; i++) { api.saveHistory(fakeData("p" + i, "node", "lib")); }
  var arr2 = api.listHistory();
  C.ok("存 25 条后 listHistory 长度=20（滚动删最旧）", arr2.length === 20, "实际 " + arr2.length);
  C.ok("最新是 p24（unshift 在头）", arr2[0].name === "p24", "实际最新 " + arr2[0].name);
  C.ok("最旧保留的是 p5（p0~p4 被滚删）", arr2[arr2.length - 1].name === "p5", "实际最旧 " + arr2[arr2.length - 1].name);

  // 4. 删除单条
  api.clearHistory();
  api.saveHistory(fakeData("keep", "node", "lib"));
  var toDel = api.saveHistory(fakeData("delme", "node", "lib"));
  api.deleteHistory(toDel.id);
  var arr3 = api.listHistory();
  C.ok("删除后剩 1 条", arr3.length === 1, "实际 " + arr3.length);
  C.ok("删除后保留的是 keep", arr3[0].name === "keep");

  // 5. 清空全部
  api.saveHistory(fakeData("x", "node", "lib"));
  api.clearHistory();
  C.ok("清空后 listHistory 为空", api.listHistory().length === 0);

  // 6. 降级：data 无效不存
  api.clearHistory();
  var r = api.saveHistory(null);
  C.ok("data=null 时 saveHistory 返回 null", r === null);
  C.ok("data=null 不产生存档", api.listHistory().length === 0);

  // 7. 容错：data 缺 phases/artifacts 也不崩
  var snap2 = api.saveHistory({ label: "A", root: "r", name: "r", files: 1, type: "t", auto: "x", profile: "x", profileName: "X" });
  C.ok("缺 phases/artifacts 的 data 也能存档", snap2 && snap2.phaseTotal === 0 && snap2.artifactTotal === 0);

  api.clearHistory(); // teardown
})();

// ── 汇总 ───────────────────────────────────────────────────────
console.log(`\n通过 ${C.state.pass} 项，失败 ${C.state.fail} 项`);
if (C.state.fail > 0) {
  console.error("\n失败项：");
  C.state.failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("All logic tests passed.");
