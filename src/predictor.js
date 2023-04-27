export default function Predictor(
  url,
  model,
  label,
  horizon,
  interval,
  columns
) {
  url = url + `/api/projects/mindsdb/models/${model}/predict`
  const controller = new AbortController()

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
        prediction_timestamp: timestamp + horizon * interval * 60,
        prediction: Number(json[0][label]),
        confidence: json[0][`${label}_confidence`],
      }
    },
    abort: () => controller.abort(),
  }
}
