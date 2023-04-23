export function newFixedArray(length) {
  const array = []
  array.add = (item) => {
    if (array.length === length) {
      array.shift()
    }
    array.push(item)
    return array.length === length
  }
  return array
}
