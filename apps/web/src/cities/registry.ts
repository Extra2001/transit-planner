import type { CityManifest } from '@transit/core'

/**
 * 城市注册表：构建期收集 cities/<id>/city.json，新增城市只需新增 manifest + 数据文件，
 * 不改城市选择器、不写死 City 联合类型。
 */
const modules = import.meta.glob('../../../../cities/*/city.json', {
  eager: true,
  import: 'default'
}) as Record<string, CityManifest>

function assertManifest(value: unknown, file: string): CityManifest {
  const m = value as CityManifest
  if (!m || typeof m !== 'object') throw new Error(`${file} 不是合法 manifest`)
  for (const key of ['id', 'name', 'shortName', 'dataUrl', 'dataVersion'] as const) {
    if (typeof m[key] !== 'string' || !m[key]) throw new Error(`${file} 缺少 ${key}`)
  }
  if (!m.license || typeof m.license.redistribution !== 'string') {
    throw new Error(`${file} 缺少 license.redistribution`)
  }
  return m
}

export const cities: CityManifest[] = Object.entries(modules)
  .map(([file, value]) => assertManifest(value, file))
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

export function getCity(id: string): CityManifest | undefined {
  return cities.find((c) => c.id === id)
}

export function defaultCity(): CityManifest {
  const redistributable = cities.find((c) => c.license.redistribution === 'allowed')
  return redistributable ?? cities[0]
}
