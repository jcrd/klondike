import assert from "assert"

import klines, { getRecentTimestamp } from "../src/klines.js"

describe("klines", () => {
  it("should generate 1m klines with sequential timestamps", async () => {
    let last = 0
    for await (const kline of klines({
      symbol: "BNBUSD",
      interval: 1,
      suffix: "m",
      limit: 1001,
    })) {
      const now = kline[0]
      if (last > 0) {
        assert.equal(now, last + 60 * 1000)
      }
      last = now
    }
    assert.equal(last, await getRecentTimestamp("BNBUSD", "1m"))
  })
  it("should generate 5m klines with sequential timestamps", async () => {
    let last = 0
    for await (const kline of klines({
      symbol: "BNBUSD",
      interval: 5,
      suffix: "m",
      limit: 1001,
    })) {
      const now = kline[0]
      if (last > 0) {
        assert.equal(now, last + 60 * 5 * 1000)
      }
      last = now
    }
    assert.equal(last, await getRecentTimestamp("BNBUSD", "5m"))
  })
})
