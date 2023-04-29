export const handlers = {
  input: {
    c: ({ close }) => [close],
    hlc: ({ high, low, close }) => [high, low, close],
  },
  trend: {
    ma: ({ close, value }) => {
      return close < value ? -1 : 1
    },
    oscillator: (max, min) => {
      return ({ value, priorValue }) => {
        if (value > max) {
          return -1
        }
        if (value < min) {
          return 1
        }
        return value > priorValue ? 1 : -1
      }
    },
  },
}

export class Indicator {
  constructor(i, handlers, columns = undefined) {
    this.indicator = i
    this.handlers = handlers
    this.columns = columns
  }

  value(v, moment = false) {
    const input = this.handlers.input(v)
    let output = moment
      ? this.indicator.momentValue(...input)
      : this.indicator.nextValue(...input)

    if ("output" in this.handlers) {
      output = this.handlers.output(output)
    }

    return output
  }

  trend(v) {
    return this.handlers.trend(v)
  }
}
