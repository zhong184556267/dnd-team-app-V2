import { useMemo } from 'react'
import {
  getTotalWeightLb,
  getMaxCapacityLb,
  getEncumbranceState,
  getInventoryWeightLb,
  getCoinWeightLb,
  ENCUMBRANCE_MULTIPLIER,
} from '../lib/encumbrance'

/**
 * 负重数据与状态，随 character.inventory / character.wallet / character.abilities.str 更新
 * @param {object} character - { abilities: { str }, inventory, wallet }
 * @param {number} [multiplier] - 负重系数，默认 15（强壮等可传 30）
 */
export function useEncumbrance(character, multiplier = ENCUMBRANCE_MULTIPLIER) {
  return useMemo(() => {
    const inventory = character?.inventory ?? []
    const wallet = character?.wallet ?? {}
    const str = character?.abilities?.str ?? 10
    const total = getTotalWeightLb(inventory, wallet)
    const max = getMaxCapacityLb(str, multiplier)
    const itemWeight = getInventoryWeightLb(inventory)
    const coinWeight = getCoinWeightLb(wallet)
    const state = getEncumbranceState(total, max, multiplier)
    return {
      total: Math.round(total * 100) / 100,
      max,
      itemWeight: Math.round(itemWeight * 100) / 100,
      coinWeight: Math.round(coinWeight * 100) / 100,
      percent: state.percent,
      status: state.status,
      statusLabel: state.label,
      statusColor: state.color,
    }
  }, [character, multiplier])
}
