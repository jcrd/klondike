import { CCI, EMA, Stochastic, SMA, WMA, ROC, RSI } from "@debut/indicators"

import { KlineKeys, klineObject } from "./klines.js"
import { newFixedArray } from "./utils.js"

const id = {
  kline: 0,
}

function ohlcProcessor(seconds) {
  const columns = ["id", ...Object.keys(KlineKeys)]
  return {
    columns,
    transform: (kline) => {
      return [id.kline, seconds ? kline[0] / 1000 : kline[0], ...kline.slice(1)]
    },
  }
}

function closeOnlyProcessor(seconds) {
  return {
    columns: ["id", "timestamp", "close"],
    transform: (kline) => [
      id.kline,
      seconds ? kline[KlineKeys.timestamp] / 1000 : kline[KlineKeys.timestamp],
      kline[KlineKeys.close],
    ],
  }
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

function withHLC(indicator) {
  return ({ high, low, close }) => indicator.nextValue(high, low, close)
}

function indicatorsProcessor(trend, stream) {
  const indicators = {
    ema10: {
      nextValue: withClose(new EMA(10)),
      trend: maTrend,
    },
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
    roc: {
      nextValue: withClose(new ROC()),
      trend: ({ value }) => (value < 0 ? -1 : 1),
    },
    cci: {
      nextValue: withHLC(new CCI()),
      trend: oscillatorTrend(200, -200),
    },
    stoch: {
      nextValue: withHLC(new Stochastic()),
      trend: (() => {
        const t = oscillatorTrend(80, 20)
        return ({ value }) => t({ value: value.k, priorValue: value.d })
      })(),
    },
  }

  const priorValues = {}
  const horizon = newFixedArray(7)
  const columns = Object.keys(indicators)
  if (!stream) {
    columns.push("trend")
  }

  return {
    columns,
    transform: (kline) => {
      const kobj = klineObject(kline)
      const values = Object.entries(indicators).map(([name, indicator]) => {
        const value = indicator.nextValue(kobj)
        const priorValue = priorValues[name]

        if (value === undefined) {
          return undefined
        }

        priorValues[name] = value

        return trend
          ? indicator.trend({ close: kobj.close, value, priorValue })
          : value
      })

      if (values.filter((v) => v === undefined).length > 0) {
        return null
      }

      if (stream) {
        return values
      } else {
        if (!horizon.add(kline)) {
          return null
        }
        // The second kline represents round lock (first is at bet time).
        const start = horizon[1]
        // The last kline represents round close.
        const end = horizon[horizon.length - 1]
        return [
          ...values,
          start[KlineKeys.close] < end[KlineKeys.close] ? 1 : -1,
        ]
      }
    },
  }
}

export default function Processor(opts, stream = false) {
  opts = {
    seconds: true,
    ...(opts || {}),
  }

  switch (opts.processor) {
    case "indicators:continuous":
      return indicatorsProcessor(false, stream)
    case "indicators:binary":
      return indicatorsProcessor(true, stream)
    case "closeOnly":
      return closeOnlyProcessor(opts.seconds)
    default:
      return ohlcProcessor(opts.seconds)
  }
}
