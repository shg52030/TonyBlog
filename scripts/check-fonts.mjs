#!/usr/bin/env node
/**
 * 检查当前文章里有没有「字体子集未覆盖」的字符。
 *
 * 用法：npm run font:check
 *
 * 有输出 = 这些字会回退成系统黑体（苹方 / 微软雅黑），
 * 想统一字形就运行 npm run font:build 重新生成子集。
 */
import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const COVERAGE = join(ROOT, "scripts", "font-coverage.json");
const EXTS = new Set([
  ".md",
  ".mdx",
  ".astro",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".txt",
]);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (EXTS.has(extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

const files = await walk(SRC);
// 根目录配置里的中文（站点标题、描述）也要算进去
for (const name of ["astro-paper.config.ts", "astro.config.ts"]) {
  const full = join(ROOT, name);
  try {
    await readFile(full, "utf8");
    files.push(full);
  } catch {
    /* 文件不存在就跳过 */
  }
}
let text = "";
for (const file of files) {
  try {
    text += await readFile(file, "utf8");
  } catch {
    /* 二进制或读不了的文件直接跳过 */
  }
}

const covered = new Set(JSON.parse(await readFile(COVERAGE, "utf8")).chars);
const missing = [
  ...new Set(
    [...text].filter(c => {
      if (c === "\n" || c === "\r" || c === "\t") return false;
      return !covered.has(c);
    })
  ),
];

if (missing.length === 0) {
  console.log("字体子集完整覆盖当前内容，无需重新生成。");
  process.exit(0);
}

console.log(`有 ${missing.length} 个字符不在字体子集里，它们会回退为系统字体：\n`);
console.log("  " + missing.join(" "));
console.log("\n运行 npm run font:build 重新生成子集后提交 public/fonts 下的文件。");
process.exit(1);
