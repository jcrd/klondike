import { CCI, SMA, WMA, RSI } from "@debut/indicators"

import { KlineKeys, parseKline, klineObject } from "./klines.js"

function maTrend({ close, value }) {
  return close < value ? -1 : 1
}

function oscillatorTrend(max, min) {
  return ({ value, priorValue }) => {
    if (value > max) {
      return -1
    }
    if (value < min) {
      return 1
    }
    return value > priorValue ? 1 : -1
  }
}

function withClose(indicator) {
  return ({ close }) => indicator.nextValue(close)
}

export default function Processor(opts = {}) {
  opts = { ...{ volume: true, indicators: true }, ...opts }

  const indicators = {
    sma10: {
      nextValue: withClose(new SMA(10)),
      trend: maTrend,
    },
    wma10: {
      nextValue: withClose(new WMA(10)),
      trend: maTrend,
    },
    rsi: {
      nextValue: withClose(new RSI()),
      trend: oscillatorTrend(70, 30),
    },
    cci: {
      nextValue: (
        (indicator) =>
        ({ high, low, close }) =>
          indicator.nextValue(high, low, close)
      )(new CCI()),
      trend: oscillatorTrend(200, -200),
    },
  }

  const columns = Object.keys(KlineKeys)
  if (!opts.volume) {
    columns.pop()
  }
  if (opts.indicators) {
    columns.push(...Object.keys(indicators))
  }

  const priorValues = {}

  return {
    columns,
    transform: (kline) => {
      kline = parseKline(kline)
      if (!opts.volume) {
        kline.pop()
      }

      let values = []

      if (opts.indicators) {
        const kobj = klineObject(kline)
        values = Object.entries(indicators).map(([name, indicator]) => {
          const value = indicator.nextValue(kobj)
          const priorValue = priorValues[name]

          if (value === undefined) {
            return undefined
          }

          priorValues[name] = value

          return indicator.trend({ close: kobj.close, value, priorValue })
        })

        if (values.filter((v) => v === undefined).length > 0) {
          return null
        }
      }

      return [kline[0] / 1000, ...kline.slice(1), ...values]
    },
  }
}
