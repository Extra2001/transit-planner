#!/usr/bin/env node
/**
 * 公开产物安全检查：构建完成后运行，断言未授权数据没有进入 dist。
 *
 * 检查项：
 *   1. dist/cities/ 下只允许出现 license.redistribution = allowed 的城市；
 *   2. 受限城市的数据文件名不得出现在任何构建产物里；
 *   3. 入口 JS 不应内联整份城市时刻表（用 trips 数组特征串粗查）。
 *
 * 用法：
 *   node scripts/verify-public.mjs
 *   node scripts/verify-public.mjs --dist=<dir> --cities=<dir>   # 供闸门负向测试使用
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function argPath(name, fallback) {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? path.resolve(hit.slice(prefix.length)) : fallback
}

const dist = argPath('dist', path.join(root, 'apps/web/dist'))
const citiesDir = argPath('cities', path.join(root, 'cities'))

if (!fs.existsSync(dist)) {
  console.error(`找不到构建产物：${dist}，请先运行 npm run build`)
  process.exit(1)
}

const manifests = fs.existsSync(citiesDir)
  ? fs
      .readdirSync(citiesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(citiesDir, d.name, 'city.json')))
      .map((d) => JSON.parse(fs.readFileSync(path.join(citiesDir, d.name, 'city.json'), 'utf8')))
  : []

const restricted = manifests.filter((m) => m.license?.redistribution !== 'allowed')
const allowedIds = new Set(manifests.filter((m) => m.license?.redistribution === 'allowed').map((m) => m.id))

const problems = []

const publishedDir = path.join(dist, 'cities')
if (fs.existsSync(publishedDir)) {
  for (const entry of fs.readdirSync(publishedDir)) {
    if (!allowedIds.has(entry)) problems.push(`dist/cities/${entry} 属于未授权城市`)
  }
}

for (const manifest of restricted) {
  const marker = path.basename(manifest.dataUrl ?? 'network.json')
  const cityDir = path.join(dist, 'cities', manifest.id)
  if (fs.existsSync(cityDir)) problems.push(`受限城市目录出现在产物中：cities/${manifest.id}`)
  if (marker === 'network.json') continue
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.includes(manifest.id)) problems.push(`产物文件名含受限城市：${full}`)
    }
  }
  walk(dist)
}

// 入口 JS 不应包含完整时刻表：抽查 "trips":[[ 结构特征
const assetsDir = path.join(dist, 'assets')
if (fs.existsSync(assetsDir)) {
  for (const file of fs.readdirSync(assetsDir)) {
    if (!file.endsWith('.js')) continue
    const text = fs.readFileSync(path.join(assetsDir, file), 'utf8')
    if (text.includes('"trips":[[') && text.length > 2_000_000) {
      problems.push(`入口资源疑似内联时刻表：assets/${file}（${(text.length / 1e6).toFixed(1)}MB）`)
    }
  }
}

if (problems.length) {
  console.error('公开产物检查失败：')
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}

console.log(`公开产物检查通过：${allowedIds.size} 个可分发城市，无未授权数据。`)
