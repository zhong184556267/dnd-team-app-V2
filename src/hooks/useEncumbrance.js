import { useMemo } from 'react'
import {
  getTotalWeightLb,
  getMaxCapacityLb,
  getEncumbranceState,
  getCarriedInventoryWeightLb,
  getCoinWeightLb,
  ENCUMBRANCE_MULTIPLIER,
  normalizeStrength,
} from '../lib/encumbrance'
import { getTotalBagCountForCharacter } from '../lib/bagOfHoldingModules'

/**
 * 负重数据与状态，随 character.inventory / character.wallet / character.abilities.str 更新
 * @param {object} character - { abilities: { str }, inventory, wallet }
 * @param {number} [multiplier] - 负重系数，默认 15（强壮等可传 30）
 */
export function useEncumbrance(character, multiplier = ENCUMBRANCE_MULTIPLIER) {
  return useMemo(() => {
    const inventory = character?.inventory ?? []
    const wallet = character?.wallet ?? {}
    const str = normalizeStrength(character?.abilities?.str, 10)
    const bagCount = getTotalBagCountForCharacter(character)
    const total = getTotalWeightLb(inventory, wallet, bagCount)
    const max = getMaxCapacityLb(str, multiplier)
    const itemWeight = getCarriedInventoryWeightLb(inventory)
    const coinWeight = getCoinWeightLb(wallet)
    const state = getEncumbranceState(total, max, multiplier, str)
    return {
      total: Math.round(total * 100) / 100,
      max,
      itemWeight: Math.round(itemWeight * 100) / 100,
      coinWeight: Math.round(coinWeight * 100) / 100,
      bagCount,
      percent: state.percent,
      status: state.status,
      statusLabel: state.label,
      statusColor: state.color,
    }
  }, [character, multiplier])
}
