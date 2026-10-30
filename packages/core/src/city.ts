/** 城市 manifest：只描述元数据与许可，不包含时刻表本身。 */
export type LicenseRedistribution = 'allowed' | 'unclear' | 'forbidden'

export interface License {
  /** SPDX 标识；未确认时用 UNCONFIRMED */
  id: string
  url: string | null
  /** 署名文本，需原样展示 */
  attribution: string
  /** 再分发状态：只有 allowed 才会进入公开构建 */
  redistribution: LicenseRedistribution
  /** 对应的完整许可说明文件（相对仓库根） */
  file?: string
}

export interface CityProvenance {
  source: string
  /** 采集/上游截止时间 */
  capturedAt: string
  validFrom: string | null
  validUntil: string | null
  /** 是否运营方官方发布 */
  official: boolean
  /** 是否实时数据（本项目当前一律 false） */
  realtime: boolean
  /** 是否为合成演示数据 */
  synthetic: boolean
  /** 本项目的处理说明 */
  modified?: string
}

export interface CityManifest {
  schemaVersion: 1
  id: string
  /** 城市选择器排序，越小越靠前 */
  order: number
  name: string
  shortName: string
  /** 数据文件路径，相对站点根 */
  dataUrl: string
  /** 数据版本，用于缓存失效 */
  dataVersion: string
  /** 数据文件自身的 schema 版本 */
  networkSchemaVersion: number
  license: License
  provenance: CityProvenance
  defaults: { from: string; to: string; time: string }
  notices: string[]
  /** 展示用文案覆盖，避免前端写死城市差异 */
  ui?: {
    /** 班次单位，如「班」「条已确认区段」 */
    tripUnit?: string
    /** 覆盖面板的数据日期标签，如「BST 标注」「采集」 */
    sourceLabel?: string
  }
}

export function isRedistributable(manifest: CityManifest): boolean {
  return manifest.license.redistribution === 'allowed'
}

/** 数据文件在站点根下的路径；去掉前导斜杠，便于拼接 base。 */
export function cityDataPath(manifest: CityManifest): string {
  return manifest.dataUrl.replace(/^\.?\//, '')
}
