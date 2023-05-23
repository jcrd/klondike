import { parseIntervalSeconds } from "binoc"

export default function Predictor(url, columns, { interval, options }) {
  const { model, label, horizon } = options
  const controller = new AbortController()
  const intervalSeconds = parseIntervalSeconds(interval)
  url = url + `/api/projects/mindsdb/models/${model}/predict`

  return {
    predict: async (input, timestamp) => {
      // Convert to seconds.
      timestamp /= 1000
      const data = {}
      for (const [i, v] of input.entries()) {
        data[columns[i]] = String(v)
      }
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: [data], params: {} }),
        signal: controller.signal,
      })
      const json = await res.json()
      return {
        input_timestamp: timestamp,
        prediction_timestamp: timestamp + horizon * intervalSeconds,
        prediction: Number(json[0][label]),
        confidence: json[0][`${label}_confidence`],
      }
    },
    abort: () => controller.abort(),
  }
}
