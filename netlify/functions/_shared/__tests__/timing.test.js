import { describe, expect, it } from 'vitest'
import { padTo } from '../timing.js'

describe('padTo', () => {
  it('waits out the remainder of the floor', async () => {
    const start = Date.now()
    await padTo(start, 120)
    expect(Date.now() - start).toBeGreaterThanOrEqual(115)
  })

  it('does not wait when the floor has already passed', async () => {
    const start = Date.now()
    await padTo(start - 500, 100)
    expect(Date.now() - start).toBeLessThan(50)
  })
})
