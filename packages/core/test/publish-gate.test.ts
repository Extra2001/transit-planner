import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * 公开发布闸门的负向测试。
 *
 * 放在 core 测试目录，是因为仓库只有这一个测试入口（vitest run），
 * 被测对象是 scripts/ 下的两个 Node 脚本，测试通过子进程调用真实脚本。
 */
const root = fileURLToPath(new URL('../../../', import.meta.url))
const syncScript = path.join(root, 'scripts/sync-cities.mjs')
const verifyScript = path.join(root, 'scripts/verify-public.mjs')

const tmpDirs: string[] = []

function tmp(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tp-${prefix}-`))
  tmpDirs.push(dir)
  return dir
}

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })
}

function manifest(id: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id,
    order: 1,
    name: `${id} 市`,
    shortName: id,
    dataUrl: `cities/${id}/network.json`,
    dataVersion: '2026-01-01',
    networkSchemaVersion: 2,
    license: { id: 'CC0-1.0', url: '', attribution: '', redistribution: 'allowed', file: '' },
    provenance: { source: 'fixture', capturedAt: '2026-01-01', official: false, realtime: false, synthetic: false, modified: null },
    defaults: { from: '甲', to: '乙', time: '08:00' },
    notices: [],
    ...overrides
  }
}

function makeCity(base: string, id: string, overrides: Record<string, unknown> = {}) {
  const dir = path.join(base, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'city.json'), JSON.stringify(manifest(id, overrides)))
  fs.writeFileSync(path.join(dir, 'network.json'), JSON.stringify({ schemaVersion: 2, city: id, stations: [], lines: [], transfers: [], trips: [] }))
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('data:sync 发布输入过滤', () => {
  function setup() {
    const cities = tmp('cities')
    makeCity(cities, 'ok-city')
    makeCity(cities, 'bad-city', {
      license: { id: 'UNCONFIRMED', url: '', attribution: '', redistribution: 'unclear', file: '' }
    })
    makeCity(cities, 'demo-city', {
      provenance: { source: 'fixture', capturedAt: '2026-01-01', official: false, realtime: false, synthetic: true, modified: null }
    })
    return { cities, out: tmp('out') }
  }

  it('默认只复制 allowed 且非合成城市', () => {
    const { cities, out } = setup()
    const r = run(syncScript, [`--cities=${cities}`, `--out=${out}`])
    expect(r.status).toBe(0)
    expect(fs.readdirSync(out)).toEqual(['ok-city'])
  })

  it('--include-restricted 才会复制许可未确认的城市', () => {
    const { cities, out } = setup()
    const r = run(syncScript, [`--cities=${cities}`, `--out=${out}`, '--include-restricted'])
    expect(r.status).toBe(0)
    expect(fs.readdirSync(out).sort()).toEqual(['bad-city', 'ok-city'])
  })

  it('每次同步先清空目标目录，上一次的受限残留不会留下', () => {
    const { cities, out } = setup()
    fs.mkdirSync(path.join(out, 'bad-city'), { recursive: true })
    fs.writeFileSync(path.join(out, 'bad-city', 'network.json'), '{}')
    run(syncScript, [`--cities=${cities}`, `--out=${out}`])
    expect(fs.existsSync(path.join(out, 'bad-city'))).toBe(false)
  })
})

describe('verify:public 负向检查', () => {
  function setup() {
    const cities = tmp('cities')
    makeCity(cities, 'ok-city')
    makeCity(cities, 'bad-city', {
      license: { id: 'UNCONFIRMED', url: '', attribution: '', redistribution: 'unclear', file: '' }
    })
    const dist = tmp('dist')
    fs.mkdirSync(path.join(dist, 'cities', 'ok-city'), { recursive: true })
    fs.writeFileSync(path.join(dist, 'cities', 'ok-city', 'network.json'), '{}')
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dist, 'assets', 'index.js'), 'console.log(1)')
    return { cities, dist }
  }

  it('干净产物通过', () => {
    const { cities, dist } = setup()
    const r = run(verifyScript, [`--dist=${dist}`, `--cities=${cities}`])
    expect(r.status).toBe(0)
  })

  it('产物里出现受限城市目录时失败', () => {
    const { cities, dist } = setup()
    fs.mkdirSync(path.join(dist, 'cities', 'bad-city'), { recursive: true })
    fs.writeFileSync(path.join(dist, 'cities', 'bad-city', 'network.json'), '{}')
    const r = run(verifyScript, [`--dist=${dist}`, `--cities=${cities}`])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('bad-city')
  })

  it('受限城市数据被内联进入口 JS 时失败', () => {
    const { cities, dist } = setup()
    const payload = `window.__x={"trips":[${'[0,0,0,[0,1]],'.repeat(150_000)}]}`
    fs.writeFileSync(path.join(dist, 'assets', 'index.js'), payload)
    const r = run(verifyScript, [`--dist=${dist}`, `--cities=${cities}`])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('内联时刻表')
  })

  it('产物缺失时失败', () => {
    const { cities } = setup()
    const r = run(verifyScript, [`--dist=${path.join(root, 'definitely-missing-dist')}`, `--cities=${cities}`])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('找不到构建产物')
  })

  it('把受限城市数据故意放进发布输入：同步后能通过，直接泄漏则失败', () => {
    const { cities, dist } = setup()
    // 1) 用默认闸门同步到产物目录：受限城市不会进入
    run(syncScript, [`--cities=${cities}`, `--out=${dist}/cities`])
    expect(fs.existsSync(path.join(dist, 'cities', 'bad-city'))).toBe(false)
    expect(run(verifyScript, [`--dist=${dist}`, `--cities=${cities}`]).status).toBe(0)

    // 2) 模拟有人绕过闸门直接拷贝受限数据：验证必须失败
    fs.mkdirSync(path.join(dist, 'cities', 'bad-city'), { recursive: true })
    fs.writeFileSync(path.join(dist, 'cities', 'bad-city', 'network.json'), '{}')
    const r = run(verifyScript, [`--dist=${dist}`, `--cities=${cities}`])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('未授权城市')
  })
})
