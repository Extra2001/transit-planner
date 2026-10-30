#!/usr/bin/env node
/**
 * 把 cities/<id>/ 下允许再分发的数据同步到 apps/web/public/cities/<id>/。
 *
 * 规则：
 *   - 每次先清空目标目录，避免上一次的受限数据残留。
 *   - license.redistribution 不是 allowed 的城市，默认跳过；
 *     只有显式 --include-restricted 或 INCLUDE_RESTRICTED_DATA=1 才复制，用于本地开发。
 *   - manifest 一并复制，便于静态检查产物内容。
 *
 * 用法：
 *   node scripts/sync-cities.mjs
 *   node scripts/sync-cities.mjs --include-restricted
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const citiesDir = path.join(root, 'cities')
const target = path.join(root, 'apps/web/public/cities')
const includeRestricted =
  process.argv.includes('--include-restricted') || process.env.INCLUDE_RESTRICTED_DATA === '1'

function readManifests() {
  if (!fs.existsSync(citiesDir)) return []
  return fs
    .readdirSync(citiesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const file = path.join(citiesDir, d.name, 'city.json')
      if (!fs.existsSync(file)) return null
      try {
        return { dir: d.name, manifest: JSON.parse(fs.readFileSync(file, 'utf8')) }
      } catch (e) {
        throw new Error(`cities/${d.name}/city.json 解析失败：${e.message}`)
      }
    })
    .filter(Boolean)
}

function copyCity({ dir, manifest }) {
  const src = path.join(citiesDir, dir)
  const dest = path.join(target, manifest.id)
  const networkFile = path.join(src, 'network.json')
  if (!fs.existsSync(networkFile)) return { id: manifest.id, copied: false, reason: '缺少数据文件' }
  fs.mkdirSync(dest, { recursive: true })
  fs.copyFileSync(networkFile, path.join(dest, 'network.json'))
  fs.copyFileSync(path.join(src, 'city.json'), path.join(dest, 'city.json'))
  const statusFile = path.join(src, 'status.json')
  if (fs.existsSync(statusFile)) fs.copyFileSync(statusFile, path.join(dest, 'status.json'))
  return { id: manifest.id, copied: true, reason: '' }
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })

const manifests = readManifests()
const copied = []
const skipped = []
for (const entry of manifests) {
  const allowed = entry.manifest?.license?.redistribution === 'allowed'
  if (!allowed && !includeRestricted) {
    skipped.push({ id: entry.manifest?.id ?? entry.dir, reason: '许可未确认，未复制' })
    continue
  }
  const result = copyCity(entry)
  if (result.copied) copied.push(result.id)
  else skipped.push({ id: result.id, reason: result.reason })
}

console.log(`城市数据同步：${copied.length} 个已复制${includeRestricted ? '（含受限数据）' : ''}`)
if (copied.length) console.log(`  ✓ ${copied.join('、')}`)
for (const s of skipped) console.log(`  – ${s.id}：${s.reason}`)
if (skipped.length && !includeRestricted) {
  console.log('受限城市仅本地可用：INCLUDE_RESTRICTED_DATA=1 npm run build:local')
}
