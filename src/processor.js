import { EMA, RSI } from "@debut/indicators"

import { KlineKeys, parseKline } from "./klines.js"

export default function Processor(opts = {}) {
  const indicators = { ema10: new EMA(10), ema20: new EMA(20), rsi: new RSI() }

  const columns = Object.keys(KlineKeys)
  if (opts.dropVolume) {
    columns.pop()
  }
  columns.push(...Object.keys(indicators))

  return {
    columns,
    transform: (kline) => {
      kline = parseKline(kline)
      if (opts.dropVolume) {
        kline.pop()
      }

      const close = kline[KlineKeys.close]
      const values = Object.values(indicators).map((i) => i.nextValue(close))

      if (values.filter((v) => v === undefined).length > 0) {
        return null
      }

      return [kline[0] / 1000, ...kline.slice(1), ...values]
    },
  }
}
