/**
 * 发布阶段的公共实现：把归一化后的网络 + 旁挂状态写入 cities/<id>/。
 *
 * 约定：
 *   - 只写两个文件：network.json、status.json；
 *   - status 必须带上来源、采集时间、有效期、许可与再分发状态；
 *   - 不判断许可，是否允许公开由 city.json 与 data:sync 决定。
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {object} opts
 * @param {string} opts.cityId
 * @param {object} opts.network   v2 网络数据
 * @param {object} opts.status    覆盖/质量统计
 * @param {object} opts.manifest  city.json（读取 license/provenance）
 * @param {string} opts.root      仓库根
 */
export function publishCity({ cityId, network, status, manifest, root }) {
  const dir = path.join(root, 'cities', cityId)
  fs.mkdirSync(dir, { recursive: true })

  const networkFile = path.join(dir, 'network.json')
  if (network) fs.writeFileSync(networkFile, JSON.stringify(network))
  else fs.rmSync(networkFile, { force: true })

  const provenance = manifest?.provenance ?? {}
  const license = manifest?.license ?? {}
  const out = {
    status: status.status ?? 'ready',
    version: status.version ?? new Date().toISOString().replace(/[:.]/g, '-'),
    capturedAt: status.capturedAt ?? provenance.capturedAt ?? null,
    counts: status.counts ?? network?.meta?.counts ?? {},
    coverage: status.coverage ?? 0,
    coverageDetail: status.coverageDetail,
    association: status.association,
    gate: status.gate,
    license: { id: license.id ?? 'UNCONFIRMED', redistribution: license.redistribution ?? 'unclear' },
    provenance: {
      source: provenance.source ?? null,
      validFrom: provenance.validFrom ?? null,
      validUntil: provenance.validUntil ?? null,
      official: provenance.official ?? false,
      realtime: provenance.realtime ?? false,
      synthetic: provenance.synthetic ?? false,
      modified: provenance.modified ?? null
    },
    note: status.note ?? '',
    warnings: status.warnings ?? network?.meta?.warnings ?? []
  }
  const statusFile = path.join(dir, 'status.json')
  fs.writeFileSync(statusFile, JSON.stringify(out, null, 1) + '\n')

  return {
    networkFile,
    statusFile,
    bytes: network ? fs.statSync(networkFile).size : 0
  }
}

export function readManifest(root, cityId) {
  const file = path.join(root, 'cities', cityId, 'city.json')
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
