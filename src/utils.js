export function newFixedArray(length) {
  const array = []
  array.add = (item) => {
    array.push(item)
    return array.length > length ? array.shift() : undefined
  }
  return array
}
