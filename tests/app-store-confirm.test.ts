import { useAppStore } from '../src/renderer/src/store/app.store'

describe('app store confirm dialog', () => {
  it('answers a replaced confirmation with false instead of leaving it pending forever', async () => {
    const first = useAppStore.getState().requestConfirm({ title: 'A', description: 'a' })
    const second = useAppStore.getState().requestConfirm({ title: 'B', description: 'b' })
    await expect(first).resolves.toBe(false)
    expect(useAppStore.getState().confirmDialog?.title).toBe('B')
    useAppStore.getState().resolveConfirm(true)
    await expect(second).resolves.toBe(true)
    expect(useAppStore.getState().confirmDialog).toBeNull()
  })
})
