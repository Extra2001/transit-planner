import type { NetworkData } from './types'
import { createNetwork } from './network'
import raw from './data/network.json'

export const network = createNetwork(raw as unknown as NetworkData)

export * from './types'
export { createNetwork, getTransfer, DEFAULT_TRANSFER_SECONDS } from './network'
export { plan, describeArrival } from './router'
export { parseClock, formatClock, formatDuration, formatMargin } from './time'
