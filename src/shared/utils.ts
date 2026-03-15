export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const createId = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`

export const chunkText = (value: string, chunkSize = 36): string[] => {
  if (!value.trim()) {
    return []
  }

  const tokens = value.split(/(\s+)/).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const token of tokens) {
    if ((current + token).length > chunkSize && current) {
      chunks.push(current)
      current = token
      continue
    }

    current += token
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}
