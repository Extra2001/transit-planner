#!/usr/bin/env node
/**
 * 重算 status.json 里的 dataSha256 / byteSize。
 *
 * 正常情况下由 scripts/lib/publish-city.mjs 在发布时写入；这个脚本用于
 * 手工改动 network.json（或恢复旧数据）后修复摘要，避免加载器判定为损坏。
 *
 * 用法：node scripts/hash-status.mjs
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const citiesDir = path.join(root, 'cities')

let updated = 0
for (const entry of fs.readdirSync(citiesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = path.join(citiesDir, entry.name)
  const networkFile = path.join(dir, 'network.json')
  const statusFile = path.join(dir, 'status.json')
  if (!fs.existsSync(networkFile) || !fs.existsSync(statusFile)) continue
  const bytes = fs.readFileSync(networkFile)
  const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
  const dataSha256 = createHash('sha256').update(bytes).digest('hex')
  if (status.dataSha256 === dataSha256 && status.byteSize === bytes.byteLength) continue
  status.dataSha256 = dataSha256
  status.byteSize = bytes.byteLength
  fs.writeFileSync(statusFile, JSON.stringify(status, null, 1) + '\n')
  updated += 1
  console.log(`已更新 ${entry.name}/status.json：${dataSha256.slice(0, 12)}…（${bytes.byteLength} B）`)
}
console.log(updated ? `共更新 ${updated} 个城市` : '所有城市摘要已是最新')
