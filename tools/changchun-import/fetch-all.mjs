#!/usr/bin/env node
/**
 * 一次性全量采样：仅在有明确授权/人工触发时使用。
 * 串行、低频、限量；遇 401/403/429/验证码立即停止，不重试、不绕过。
 *
 * 用法：node tools/changchun-import/fetch-all.mjs --confirm-bulk [--delay 3000] [--jitter 1000]
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url)) + '/../..'
const rawDir = path.join(root, 'data/changchun/raw')
const linesPath = path.join(rawDir, 'lines.json')
const manifestPath = path.join(rawDir, 'capture-manifest.json')
const progressPath = path.join(rawDir, 'fetch-progress.json')
const URL = 'http://app.ccetravel.cn/micro/other/train/time/get/table2'

const args = process.argv.slice(2)
if (!args.includes('--confirm-bulk')) {
  console.error('需要显式 --confirm-bulk 才会发起全量采样。')
  process.exit(2)
}
function flag(name, fallback) {
  const i = args.indexOf('--' + name)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
const delay = Math.max(1000, Math.min(flag('delay', 1000), 5000))
const jitter = Math.max(0, Math.min(flag('jitter', 200), 2000))
const maxRequests = Math.min(flag('max-requests', 700), 800)
const timeoutMs = Math.max(10000, Math.min(flag('timeout', 30000), 45000))

const headers = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: 'http://app.ccetravel.cn',
  Referer: 'http://app.ccetravel.cn/'
}

const lines = JSON.parse(fs.readFileSync(linesPath, 'utf8')).data.lines
let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const tasks = []
for (const line of lines) {
  const lineCode = String(line.linecode).padStart(2, '0')
  for (const stand of line.standList) {
    for (const direction of [1, 2]) {
      for (const weekday of [1, 2]) {
        tasks.push({ lineCode, standCode: String(stand.standcode), direction, weekday })
      }
    }
  }
}

// 跳过已存在且可解析的响应，便于中断后续跑
const pending = tasks.filter((t) => {
  const f = path.join(rawDir, `table2-${t.lineCode}-${t.standCode}-${t.direction}-${t.weekday}.json`)
  if (!fs.existsSync(f)) return true
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'))
    return !(d.success === true && d.data)
  } catch {
    return true
  }
})

console.log(`总任务 ${tasks.length}，待请求 ${pending.length}，间隔 ${delay}–${delay + jitter}ms，上限 ${maxRequests}`)
if (pending.length > maxRequests) {
  console.error(`待请求 ${pending.length} 超过上限 ${maxRequests}，未开始。`)
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')

manifest.requestPolicy = {
  serial: true,
  minDelaySeconds: delay / 1000,
  maxRequests,
  authBypass: false,
  bulkCollection: 'explicit user-approved full sample',
  stopOn: ['401', '403', '429', 'captcha', '验证码', '访问限制']
}

let done = 0
for (const t of pending) {
  if (done > 0) await sleep(delay + Math.floor(Math.random() * (jitter + 1)))
  const body = { lineCode: t.lineCode, standCode: t.standCode, direction: String(t.direction), weekday: t.weekday }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(URL, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  } catch (e) {
    clearTimeout(timer)
    console.error('请求失败，停止：', e instanceof Error ? e.message : e)
    break
  }
  clearTimeout(timer)
  const text = await res.text()
  if ([401, 403, 429, 451].includes(res.status)) {
    console.error(`HTTP ${res.status}：停止，不重试、不绕过。`)
    break
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}：停止。`)
    break
  }
  if (/captcha|验证码|访问频繁|访问受限/i.test(text)) {
    console.error('响应含验证码/访问限制，停止。')
    break
  }
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    console.error('非 JSON 响应，停止。')
    break
  }
  if (payload.success !== true) {
    console.error('接口 success!=true，停止：', payload.message ?? payload.code)
    break
  }
  const file = `table2-${t.lineCode}-${t.standCode}-${t.direction}-${t.weekday}.json`
  fs.writeFileSync(path.join(rawDir, file), text)
  manifest.items = manifest.items.filter((x) => x.file !== file)
  manifest.items.push({
    file,
    bytes: Buffer.byteLength(text),
    sha256: sha(Buffer.from(text)),
    savedAt: new Date().toISOString(),
    request: { method: 'POST', url: URL, body },
    response: { status: res.status, contentType: res.headers.get('content-type') }
  })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(
    progressPath,
    JSON.stringify({ updatedAt: new Date().toISOString(), done, total: pending.length, last: file }, null, 2)
  )
  done++
  if (done % 10 === 0 || done === pending.length) console.log(`进度 ${done}/${pending.length} ${file}`)
}
fs.writeFileSync(
  progressPath,
  JSON.stringify({ updatedAt: new Date().toISOString(), done, total: pending.length, finished: done === pending.length }, null, 2)
)
console.log(`完成 ${done}/${pending.length} 个请求。`)
