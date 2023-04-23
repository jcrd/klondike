import { CCI, SMA, WMA, RSI } from "@debut/indicators"

import { KlineKeys, parseKline, klineObject } from "./klines.js"

const id = {
  kline: 0,
}

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
  const def = opts.closeOnly
    ? { volume: false, indicators: false, seconds: true }
    : { volume: true, indicators: true, seconds: true }

  opts = { ...def, ...opts }

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

  const columns = ["id", ...Object.keys(KlineKeys)]
  if (!opts.volume) {
    columns.pop()
  }
  if (opts.indicators) {
    columns.push(...Object.keys(indicators))
  }

  const priorValues = {}

  return {
    columns: opts.closeOnly ? ["id", "timestamp", "close"] : columns,
    transform: (kline) => {
      kline = parseKline(kline)
      if (!opts.volume) {
        kline.pop()
      }

      const kobj = klineObject(kline)
      let values = []

      if (opts.indicators) {
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

      return opts.closeOnly
        ? [
            id.kline,
            opts.seconds ? kobj.timestamp / 1000 : kobj.timestamp,
            kobj.close,
          ]
        : [
            id.kline,
            opts.seconds ? kline[0] / 1000 : kline[0],
            ...kline.slice(1),
            ...values,
          ]
    },
  }
}
