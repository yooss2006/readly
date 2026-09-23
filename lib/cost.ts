export const MONTHLY_STOP_KRW = 24_000
export const DAILY_LIMIT = 5
export const MAX_SOURCE_CHARS = 60_000
export const MAX_SUMMARY_OUTPUT_TOKENS = 4_000
export const MAX_SPEECH_CHARS = 4_096

const SUMMARY_INPUT_USD_PER_M = 0.1
const SUMMARY_CACHED_INPUT_USD_PER_M = 0.01
const SUMMARY_CACHE_WRITE_USD_PER_M = 0.125
const SUMMARY_OUTPUT_USD_PER_M = 0.5
const SPEECH_USD_PER_M_CHAR = 15

export function exchangeRate(): number {
  const rate = Number(process.env.USD_KRW_RATE || 1700)
  if (!Number.isFinite(rate) || rate < 1000 || rate > 5000) throw new Error('USD_KRW_RATE 설정을 확인해 주세요.')
  return rate
}

export function summaryCostKrw(
  inputTokens: number, outputTokens: number, rate = exchangeRate(), cachedTokens = 0, cacheWriteTokens = 0,
): number {
  const regularTokens = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens)
  const inputUsd = regularTokens * SUMMARY_INPUT_USD_PER_M + cachedTokens * SUMMARY_CACHED_INPUT_USD_PER_M +
    cacheWriteTokens * SUMMARY_CACHE_WRITE_USD_PER_M
  return Math.ceil((inputUsd + outputTokens * SUMMARY_OUTPUT_USD_PER_M) * rate / 1_000_000)
}

export function speechCostKrw(characters: number, rate = exchangeRate()): number {
  return Math.ceil(characters * SPEECH_USD_PER_M_CHAR * rate / 1_000_000)
}

// UTF-8 bytes are a conservative bound for the model's input token count.
export function summaryReserveKrw(rate = exchangeRate()): number {
  return summaryCostKrw(190_000, MAX_SUMMARY_OUTPUT_TOKENS, rate, 0, 190_000)
}

export function speechReserveKrw(rate = exchangeRate()): number {
  return speechCostKrw(MAX_SPEECH_CHARS, rate)
}
