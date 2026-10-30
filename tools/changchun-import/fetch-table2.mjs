#!/usr/bin/env node
/**
 * 受控的 table2 采样器：串行、低频、限量、遇限制即停。
 * 不做全站扫描；必须显式给出站码/方向/weekday，并加 --confirm 才会发请求。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url)) + '/../..'
const rawDir = path.join(root, 'data/changchun/raw')
fs.mkdirSync(rawDir, { recursive: true })

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: 'http://app.ccetravel.cn',
  Referer: 'http://app.ccetravel.cn/'
}
const URL = 'http://app.ccetravel.cn/micro/other/train/time/get/table2'

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1)
    else {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[a.slice(2)] = next
        i++
      } else flags[a.slice(2)] = true
    }
  }
  return flags
}

function csv(v) {
  return String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const flags = parseArgs(process.argv.slice(2))
if (!flags.line || !flags.stations || !flags.directions || !flags.weekdays) {
  console.error('用法：fetch-table2.mjs --line 01 --stations 0121,0122 --directions 2 --weekdays 1 --confirm')
  process.exit(2)
}
if (flags.confirm !== true && flags.confirm !== 'true') {
  console.error('未加 --confirm：这是受控采样器，不会发请求。')
  process.exit(2)
}

const lineCode = String(flags.line).padStart(2, '0')
const stations = csv(flags.stations)
const directions = csv(flags.directions).map(Number)
const weekdays = csv(flags.weekdays).map(Number)
const requested = []
for (const standCode of stations) for (const direction of directions) for (const weekday of weekdays) requested.push({ standCode, direction, weekday })
const maxRequests = Math.min(Number(flags['max-requests'] ?? 8), 20)
if (requested.length > maxRequests) {
  console.error(`请求数 ${requested.length} 超过上限 ${maxRequests}；请缩小范围或提高 --max-requests（最多 20）。`)
  process.exit(2)
}
const delayMs = Math.max(3000, Math.min(Number(flags.delay ?? 4000), 10000))
const timeoutMs = Math.max(5000, Math.min(Number(flags.timeout ?? 15000), 30000))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jitter = () => 300 + Math.floor(Math.random() * 1200)
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

const manifestPath = path.join(rawDir, 'capture-manifest.json')
let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
} catch {
  manifest = { source: '长春 E 出行 H5', items: [], requestPolicy: {} }
}
manifest.requestPolicy = {
  serial: true,
  minDelaySeconds: 3,
  maxRequests,
  authBypass: false,
  bulkCollection: false,
  stopOn: ['401', '403', '429', 'captcha', '验证码', '访问限制']
}

let done = 0
for (const req of requested) {
  if (done > 0) await sleep(delayMs + jitter())
  const body = { lineCode, standCode: req.standCode, direction: String(req.direction), weekday: req.weekday }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (e) {
    clearTimeout(timer)
    console.error('请求失败/超时，停止：', e instanceof Error ? e.message : e)
    break
  }
  clearTimeout(timer)
  const text = await res.text()
  if ([401, 403, 429, 451].includes(res.status)) {
    console.error(`HTTP ${res.status}：触发访问限制，停止，不重试、不绕过。`)
    break
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}：停止。`)
    break
  }
  if (/captcha|验证码|访问频繁|访问受限/i.test(text)) {
    console.error('响应含验证码/访问限制字样，停止，不绕过。')
    break
  }
  const file = `table2-${lineCode}-${req.standCode}-${req.direction}-${req.weekday}.json`
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
  done++
  console.log(`ok ${file} (${Buffer.byteLength(text)} bytes)`)
}
console.log(`完成 ${done}/${requested.length} 个请求；未做并发/重试。`)
