import { CCI, EMA, Stochastic, SMA, WMA, ROC, RSI } from "@debut/indicators"

import { KlineKeys, klineObject } from "./klines.js"
import { Indicator, handlers } from "./indicator.js"
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

function closeProcessor(seconds) {
  return {
    columns: ["id", "timestamp", "close"],
    transform: (kline) => [
      id.kline,
      seconds ? kline[KlineKeys.timestamp] / 1000 : kline[KlineKeys.timestamp],
      kline[KlineKeys.close],
    ],
  }
}

function indicatorsProcessor({ stream, trend, options }) {
  const { horizon, label, indicators } = options

  const indicatorsMap = {
    ema10: new Indicator(new EMA(10), {
      input: handlers.input.c,
      trend: handlers.trend.ma,
    }),
    sma10: new Indicator(new SMA(10), {
      input: handlers.input.c,
      trend: handlers.trend.ma,
    }),
    rsi: new Indicator(new RSI(), {
      input: handlers.input.c,
      trend: handlers.trend.oscillator(70, 30),
    }),
    roc: new Indicator(new ROC(), {
      input: handlers.input.c,
      trend: ({ value }) => (value < 0 ? -1 : 1),
    }),
    cci: new Indicator(new CCI(), {
      input: handlers.input.hlc,
      trend: handlers.trend.oscillator(200, -200),
    }),
    stoch: new Indicator(
      new Stochastic(),
      {
        input: handlers.input.hlc,
        output: (v) => {
          if (v === undefined || v.k === undefined || v.d === undefined) {
            return undefined
          }
          return [v.k, v.d]
        },
        trend: (() => {
          const h = handlers.trend.oscillator(80, 20)
          return ({ value }) => h({ value: value[0], priorValue: value[1] })
        })(),
      },
      ["stochK", "stochD"]
    ),
  }

  if (indicators) {
    for (const [name, state] of Object.entries(indicators)) {
      if (state === false) {
        delete indicatorsMap[name]
      }
    }
  }

  const priorValues = {}
  const horizonKlines = newFixedArray(horizon + 1)
  const columns = []
  for (const [key, v] of Object.entries(indicatorsMap)) {
    if (v.columns) {
      columns.push(...v.columns)
    } else {
      columns.push(key)
    }
  }
  if (!stream) {
    columns.push(label)
  }

  return {
    columns,
    transform: (kline, moment = false) => {
      const kobj = klineObject(kline)
      const values = Object.entries(indicatorsMap)
        .map(([name, indicator]) => {
          const value = indicator.value(kobj, moment)
          const priorValue = priorValues[name]

          if (value === undefined) {
            return undefined
          }

          priorValues[name] = value

          return trend
            ? indicator.trend({ close: kobj.close, value, priorValue })
            : value
        })
        .flat()

      if (values.filter((v) => v === undefined).length > 0) {
        return null
      }

      if (stream) {
        return values
      } else {
        if (!horizonKlines.add(kline)) {
          return null
        }
        // The second kline represents round lock (first is at bet time).
        const start = horizonKlines[1]
        // The last kline represents round close.
        const end = horizonKlines[horizonKlines.length - 1]
        return [
          ...values,
          start[KlineKeys.close] < end[KlineKeys.close] ? 1 : -1,
        ]
      }
    },
  }
}

export default function Processor(options, stream = false) {
  options = {
    seconds: true,
    ...(options || {}),
  }

  switch (options.processor) {
    case "indicators:continuous":
      return indicatorsProcessor({
        stream,
        trend: false,
        options,
      })
    case "indicators:binary":
      return indicatorsProcessor({
        stream,
        trend: true,
        options,
      })
    case "close":
      return closeProcessor(options.seconds)
    default:
      return ohlcProcessor(options.seconds)
  }
}
