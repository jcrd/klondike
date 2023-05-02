import { Validator } from "../src/validator.js"

const columns = [
  "input_timestamp",
  "prediction_timestamp",
  "close_timestamp",
  "lockPrice",
  "closePrice",
  "prediction",
  "result",
]

const v = Validator("./rc.validate.json", "./data", columns)

await v.write((_, [r, p]) => {
  return [
    p.input_timestamp,
    p.prediction_timestamp,
    r.closeTimestamp,
    r.closePrice,
    r.lockPrice,
    p.prediction,
    r.result,
  ]
})

const data = {
  accurate: 0,
  total: 0,
}

await v.process((_, input) => {
  if (input[5] === input[6]) {
    data.accurate++
  }
  data.total++
})

console.log("Accuracy", data.accurate / data.total)
