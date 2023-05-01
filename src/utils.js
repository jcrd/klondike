export function newFixedArray(length) {
  const array = []
  array.add = (item) => {
    array.push(item)
    return array.length > length ? array.shift() : undefined
  }
  return array
}

export function newInterval(value, suffix) {
  let seconds
  switch (suffix) {
    case "s":
      seconds = 1
      break
    case "m":
      seconds = value * 60
      break
  }
  return [seconds, String(value) + suffix]
}
