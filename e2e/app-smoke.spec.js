import { test, expect } from '@playwright/test'
import { loginAs, clearAppStorage } from './helpers.js'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await clearAppStorage(page)
})

test('登录：玩家名输入与进入首页', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#login-name')).toBeVisible()
  await page.locator('#login-name').fill('E2E玩家')
  await expect(page.locator('#login-name')).toHaveValue('E2E玩家')
  await page.getByRole('button', { name: '进入繁星世界' }).click()
  await expect(page.getByRole('link', { name: '首页' })).toBeVisible()
})

test('团队仓库：金库区块与金额调整输入', async ({ page }) => {
  await loginAs(page, `vault-${Date.now()}`)
  await page.getByRole('link', { name: '团队仓库' }).click()
  await expect(page.getByRole('heading', { name: '团队金库' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '金额调整' })).toBeVisible()
  const qty = page.getByPlaceholder('数量', { exact: true })
  await qty.fill('100')
  await expect(qty).toHaveValue('100')
  await page.getByRole('button', { name: '加入' }).click()
  await expect(page.getByRole('heading', { name: '团队金库' }).first()).toBeVisible()
})

test('团队仓库：添加物品打开表单', async ({ page }) => {
  await loginAs(page, `wh-${Date.now()}`)
  await page.getByRole('link', { name: '团队仓库' }).click()
  await page.getByRole('button', { name: '添加物品' }).click()
  await expect(page.getByText('选择物品类型', { exact: false })).toBeVisible()
})

test('新建角色：填写并进入角色卡', async ({ page }) => {
  await loginAs(page, `newchar-${Date.now()}`)
  await page.goto('/characters/new')
  const name = `测试角色_${Date.now()}`
  await page.getByPlaceholder('请输入角色名').fill(name)
  await page.getByRole('button', { name: '创建并编辑' }).click()
  await page.waitForURL(/\/characters\/[a-f0-9-]{36}/i, { timeout: 60_000 })
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible()
})

test('角色卡：基础输入框可编辑（备注）', async ({ page }) => {
  await loginAs(page, `sheet-${Date.now()}`)
  await page.goto('/characters/new')
  const name = `备注测试_${Date.now()}`
  await page.getByPlaceholder('请输入角色名').fill(name)
  await page.getByRole('button', { name: '创建并编辑' }).click()
  await page.waitForURL(/\/characters\/[a-f0-9-]{36}/i, { timeout: 60_000 })
  const backstory = page.getByPlaceholder('输入角色背景故事，内容过长时可拖动右侧滚动条浏览…')
  await backstory.waitFor({ state: 'visible', timeout: 30_000 })
  await backstory.fill('E2E 背景一段')
  await expect(backstory).toHaveValue('E2E 背景一段')
})

test('导航：角色法术与更多页可打开', async ({ page }) => {
  await loginAs(page, `nav-${Date.now()}`)
  await page.getByRole('link', { name: '角色法术' }).click()
  await expect(page).toHaveURL(/\/character-spells/)
  await page.getByRole('link', { name: '更多' }).click()
  await expect(page).toHaveURL(/\/more/)
})

test('首页：已创建角色在列表中可见', async ({ page }) => {
  await loginAs(page, `dash-${Date.now()}`)
  await page.goto('/characters/new')
  const name = `列表角色_${Date.now()}`
  await page.getByPlaceholder('请输入角色名').fill(name)
  await page.getByRole('button', { name: '创建并编辑' }).click()
  await page.waitForURL(/\/characters\/[a-f0-9-]{36}/i, { timeout: 60_000 })
  await page.getByRole('link', { name: '首页' }).click()
  /** 模组行默认折叠，需展开后才显示角色列表 */
  await page.locator('div[role="button"]').filter({ hasText: '个角色' }).first().click()
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible()
})
