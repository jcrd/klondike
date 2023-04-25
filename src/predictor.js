export default function Predictor(model, label, columns) {
  const controller = new AbortController()
  const url =
    process.env.MINDSDB_URL + `/api/projects/mindsdb/models/${model}/predict`

  return {
    predict: async (input) => {
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
        trend: Number(json[0][label]),
        confidence: json[0][`${label}_confidence`],
      }
    },
    abort: () => controller.abort(),
  }
}
