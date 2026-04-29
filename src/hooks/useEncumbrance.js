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
    const totalRaw = getTotalWeightLb(inventory, wallet, bagCount)
    const total = Math.round(totalRaw * 10) / 10
    const maxRaw = getMaxCapacityLb(str, multiplier)
    const max = Math.round(maxRaw * 10) / 10
    const itemWeightRaw = getCarriedInventoryWeightLb(inventory)
    const coinWeightRaw = getCoinWeightLb(wallet)
    const itemWeight = Math.round(itemWeightRaw * 10) / 10
    const coinWeight = Math.round(coinWeightRaw * 10) / 10
    const state = getEncumbranceState(total, max, multiplier, str)
    return {
      total,
      max,
      itemWeight,
      coinWeight,
      bagCount,
      percent: state.percent,
      status: state.status,
      statusLabel: state.label,
      statusColor: state.color,
    }
  }, [character, multiplier])
}
