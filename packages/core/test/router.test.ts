import { describe, expect, it } from 'vitest'
import { network, plan } from '../src/index'

const base = {
  day: 'weekday' as const,
  speed: 1,
  bufferSec: 30,
  sprint: 1.35,
  minSaveSec: 90
}

describe('数据完整性', () => {
  it('线路、车站与换乘站数量符合裁剪结果', () => {
    expect(network.lines).toHaveLength(4)
    expect(network.stations).toHaveLength(89)
    expect(network.interchange.size).toBe(8)
    expect(network.tripsById).toHaveLength(4042)
  })

  it('所有车次时刻单调、站序合法', () => {
    for (const trip of network.tripsById) {
      expect(trip.stops.length).toBeGreaterThanOrEqual(2)
      for (let i = 1; i < trip.stops.length; i++) {
        expect(trip.stops[i].minute).toBeGreaterThanOrEqual(trip.stops[i - 1].minute)
      }
    }
  })

  it('八个换乘站双向换乘时间齐备且为正', () => {
    for (const s of network.interchange) {
      const lines = network.lineAt[s]
      for (const a of lines) {
        for (const b of lines) {
          if (a === b) continue
          const rec = network.transferMap.get(`${s}:${a}:${b}`)
          expect(
            rec,
            `${network.stations[s]} ${network.lines[a].name}→${network.lines[b].name}`
          ).toBeTruthy()
          expect(rec!.sec).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('最早到达', () => {
  it('4 号线直达：西直门 → 北京南站', () => {
    const r = plan(network, { ...base, from: '西直门', to: '北京南站', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers).toHaveLength(0)
    expect(r.normal!.legs.filter((l) => l.type === 'ride')).toHaveLength(1)
    expect(r.normal!.arrival).toBeGreaterThanOrEqual(8 * 60 * 60)
    expect(r.normal!.arrival).toBeLessThan((8 * 60 + 25) * 60)
  })

  it('1 号线直达：西单 → 东单', () => {
    const r = plan(network, { ...base, from: '西单', to: '东单', time: '09:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers).toHaveLength(0)
    expect(r.normal!.legs[0]).toMatchObject({ type: 'ride', line: 0 })
  })

  it('跨线换乘：西直门 → 东单', () => {
    const r = plan(network, { ...base, from: '西直门', to: '东单', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers.length).toBeGreaterThanOrEqual(1)
    expect(r.normal!.legs.some((l) => l.type === 'walk')).toBe(true)
  })

  it('错误站点返回明确失败', () => {
    const r = plan(network, { ...base, from: '西直门', to: '环球度假区', time: '08:00' })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('覆盖范围')
  })
})

describe('步速、换乘建议与末班', () => {
  it('更快步速不会更晚到达', () => {
    const slow = plan(network, { ...base, from: '西直门', to: '东单', time: '08:00', speed: 0.8 })
    const fast = plan(network, { ...base, from: '西直门', to: '东单', time: '08:00', speed: 1.3 })
    expect(slow.ok && fast.ok).toBe(true)
    expect(fast.normal!.arrival).toBeLessThanOrEqual(slow.normal!.arrival)
  })

  it('换乘余量非负，下一班晚于当前班，冲刺有明确收益', () => {
    const r = plan(network, { ...base, from: '西直门', to: '东单', time: '08:00' })
    expect(r.ok).toBe(true)
    const t = r.normal!.transfers[0]
    expect(t.marginSeconds).toBeGreaterThanOrEqual(0)
    expect(t.sprintCatch).toBeTruthy()
    expect(t.sprintCatch!.gainSeconds).toBeGreaterThan(0)
    expect(t.nextTrain).toBeTruthy()
    expect(t.nextTrain!.depart).toBeGreaterThan(0)
    expect(t.nextTrain!.lossSeconds).toBeGreaterThanOrEqual(0)
    expect(r.savingSeconds).toBeGreaterThan(0)
    expect(r.fast!.arrival).toBeLessThan(r.normal!.arrival)
    expect(r.worthRunning).toBe(true)
  })

  it('双休日时刻可用', () => {
    const r = plan(network, { ...base, day: 'weekend', from: '西直门', to: '东单', time: '10:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.arrival).toBeGreaterThan(10 * 60 * 60)
  })

  it('凌晨 02:00 与末班后 23:50 无车时明确失败', () => {
    for (const time of ['02:00', '23:50']) {
      const r = plan(network, { ...base, from: '西直门', to: '北京南站', time })
      expect(r.ok).toBe(false)
      expect(r.reason).toContain('没有可用班次')
    }
  })

  it('起终点相同时返回零时长方案', () => {
    const r = plan(network, { ...base, from: '西直门', to: '西直门', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.duration).toBe(0)
    expect(r.normal!.legs).toHaveLength(0)
  })
})
