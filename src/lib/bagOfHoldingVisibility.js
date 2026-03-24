/**
 * 次元袋在「团队仓库」页的可见性（存于角色卡）
 * private：仅本人角色卡可见，团队仓库页不列出袋内物品
 * public：全体玩家可在团队仓库「公家次元袋」查看袋内（新建模块默认为此项）
 */
export const BAG_OF_HOLDING_VISIBILITY = {
  PRIVATE: 'private',
  PUBLIC: 'public',
}

/** @param {unknown} v */
export function normalizeBagOfHoldingVisibility(v) {
  return v === BAG_OF_HOLDING_VISIBILITY.PUBLIC
    ? BAG_OF_HOLDING_VISIBILITY.PUBLIC
    : BAG_OF_HOLDING_VISIBILITY.PRIVATE
}
