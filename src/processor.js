import { EMA } from "@debut/indicators"

import { KlineKeys, parseKline } from "./klines.js"

export default function Processor() {
  const indicators = { ema10: new EMA(10) }

  return {
    columns: Object.keys(indicators),
    transform: (kline) => {
      kline = parseKline(kline)

      const close = kline[KlineKeys.close]
      const values = Object.values(indicators).map((i) => i.nextValue(close))

      if (values.filter((v) => v === undefined).length > 0) {
        return null
      }

      return [kline[0] / 1000, ...kline.slice(1), ...values]
    },
  }
}
