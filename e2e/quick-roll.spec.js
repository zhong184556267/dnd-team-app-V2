/**
 * 快捷投掷与 3D / 底栏一致性测试。
 * - 已覆盖：预设伤害事件、d20 检定（六项豁免）、底栏公式投掷。
 * - 战斗页 CombatStatus 内投掷（先攻/死亡豁免/武器法术等）依赖背包、战斗手段等数据，需带档手测或另做数据种子。
 */
import { test, expect } from '@playwright/test'
import { loginAs, clearAppStorage } from './helpers.js'

const ANIM_MS = 1800
const HOLD_MS = 1400
const WAIT_RESULT_MS = ANIM_MS + HOLD_MS + 400

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await clearAppStorage(page)
})

/**
 * 预设「已掷骰」事件：与 CombatStatus 发出格式一致，走 beginPresetDiceAnimation → 3D → applyExternalRollFromDetail
 */
async function dispatchPresetDamageRoll(page, { formula, diceValues, total, rolls, label = '测试伤害' }) {
  await page.evaluate(
    ({ formula, diceValues, total, rolls, label }) => {
      window.dispatchEvent(
        new CustomEvent('dnd-external-roll', {
          detail: {
            animate: true,
            formula,
            diceValues,
            total,
            rolls,
            modifier: 0,
            dice: formula,
            label,
          },
        }),
      )
    },
    { formula, diceValues, total, rolls, label },
  )
}

test('预设伤害：出现 3D 层、滚动提示、底栏合计与公式一致', async ({ page }) => {
  await loginAs(page, `qr-${Date.now()}`)
  await page.goto('/characters/new')
  await page.getByPlaceholder('请输入角色名').fill('骰子测试')
  await page.getByRole('button', { name: '创建并编辑' }).click()
  await page.waitForURL(/\/characters\/[a-f0-9-]{36}/i, { timeout: 60_000 })

  await dispatchPresetDamageRoll(page, {
    formula: '2d6+3',
    diceValues: [4, 5],
    rolls: [4, 5],
    total: 12,
  })

  await expect(page.getByTestId('three-dice-overlay')).toBeVisible()
  await expect(page.getByText(/骰子滚动中/)).toBeVisible()
  await page.waitForTimeout(WAIT_RESULT_MS)
  await expect(page.getByTestId('three-dice-overlay')).toHaveCount(0)

  const strip = await page.locator('.font-mono.text-dnd-gold-light').first().innerText()
  expect(strip).toMatch(/=12/)
  expect(strip).toMatch(/2d6\+3/)
  expect(strip).toMatch(/\(4,5\)/)
})

test('六项属性豁免：每次快捷投掷均出现 3D，底栏含 1d20 与总值', async ({ page }) => {
  await loginAs(page, `save-${Date.now()}`)
  await page.goto('/characters/new')
  await page.getByPlaceholder('请输入角色名').fill('豁免六项')
  await page.getByRole('button', { name: '创建并编辑' }).click()
  await page.waitForURL(/\/characters\/[a-f0-9-]{36}/i, { timeout: 60_000 })

  const saves = ['力量豁免', '敏捷豁免', '体质豁免', '智力豁免', '感知豁免', '魅力豁免']
  for (const label of saves) {
    await page.getByTitle(`投掷 ${label}`).scrollIntoViewIfNeeded()
    await page.getByTitle(`投掷 ${label}`).click()
    await expect(page.getByTestId('three-dice-overlay')).toBeVisible()
    await expect(page.getByText(/骰子滚动中/)).toBeVisible()
    await page.waitForTimeout(WAIT_RESULT_MS)
    await expect(page.getByTestId('three-dice-overlay')).toHaveCount(0)
    const strip = await page.locator('.font-mono.text-dnd-gold-light').first().innerText()
    expect(strip).toMatch(/1d20/i)
    expect(strip).toMatch(/=\d+/)
  }
})

test('底栏公式：直接投掷 1d6+2', async ({ page }) => {
  await loginAs(page, `bar-${Date.now()}`)
  await page.goto('/characters/new')
  await page.getByPlaceholder('请输入角色名').fill('公式栏')
  await page.getByRole('button', { name: '创建并编辑' }).click()
  await page.waitForURL(/\/characters\/[a-f0-9-]{36}/i, { timeout: 60_000 })

  await page.getByRole('button', { name: 'D6', exact: true }).click()
  await page.getByRole('button', { name: '+', exact: true }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByLabel('骰子公式输入').fill('1d6+2')
  await page.getByRole('button', { name: '投掷', exact: true }).click()

  await expect(page.getByTestId('three-dice-overlay')).toBeVisible()
  await page.waitForTimeout(WAIT_RESULT_MS)
  const strip = await page.locator('.font-mono.text-dnd-gold-light').first().innerText()
  expect(strip).toMatch(/1d6/i)
  expect(strip).toMatch(/=\d+/)
})
