import { assert, expect } from "chai"

import klines, { getRecentTimestamp } from "../src/klines.js"

describe("klines", () => {
  it("should generate 1s klines with sequential timestamps", async () => {
    let last = 0
    let count = 0
    const ks = klines({
      symbol: "BNBUSD",
      interval: 1,
      suffix: "s",
      limit: 1001,
    })
    for await (const kline of ks.run()) {
      const now = kline[0]
      if (last > 0) {
        assert.equal(now, last + 1 * 1000)
      }
      last = now
      count++
    }
    // Race condition with 1s klines.
    const ts = await getRecentTimestamp("BNBUSD", "1s")
    expect(last).to.be.oneOf([ts, ts - 1 * 1000])
    assert.equal(count, 1001)
  })
  it("should generate 1m klines with sequential timestamps", async () => {
    let last = 0
    let count = 0
    const ks = klines({
      symbol: "BNBUSD",
      interval: 1,
      suffix: "m",
      limit: 1001,
    })
    for await (const kline of ks.run()) {
      const now = kline[0]
      if (last > 0) {
        assert.equal(now, last + 60 * 1000)
      }
      last = now
      count++
    }
    assert.equal(last, await getRecentTimestamp("BNBUSD", "1m"))
    assert.equal(count, 1001)
  })
  it("should generate 5m klines with sequential timestamps", async () => {
    let last = 0
    let count = 0
    const ks = klines({
      symbol: "BNBUSD",
      interval: 5,
      suffix: "m",
      limit: 1001,
    })
    for await (const kline of ks.run()) {
      const now = kline[0]
      if (last > 0) {
        assert.equal(now, last + 60 * 5 * 1000)
      }
      last = now
      count++
    }
    assert.equal(last, await getRecentTimestamp("BNBUSD", "5m"))
    assert.equal(count, 1001)
  })
})
