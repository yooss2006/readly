export const MONTHLY_STOP_KRW = 24_000
export const DAILY_LIMIT = 5
export const MAX_SOURCE_CHARS = 60_000
export const MAX_SUMMARY_OUTPUT_TOKENS = 1_200
export const MAX_SPEECH_CHARS = 4_096

const SUMMARY_INPUT_USD_PER_M = 0.4
const SUMMARY_OUTPUT_USD_PER_M = 1.6
const SPEECH_USD_PER_M_CHAR = 15

export function exchangeRate(): number {
  const rate = Number(process.env.USD_KRW_RATE || 1700)
  if (!Number.isFinite(rate) || rate < 1000 || rate > 5000) throw new Error('USD_KRW_RATE 설정을 확인해 주세요.')
  return rate
}

export function summaryCostKrw(inputTokens: number, outputTokens: number, rate = exchangeRate()): number {
  return Math.ceil((inputTokens * SUMMARY_INPUT_USD_PER_M + outputTokens * SUMMARY_OUTPUT_USD_PER_M) * rate / 1_000_000)
}

export function speechCostKrw(characters: number, rate = exchangeRate()): number {
  return Math.ceil(characters * SPEECH_USD_PER_M_CHAR * rate / 1_000_000)
}

// UTF-8 bytes are a conservative bound for the model's input token count.
export function summaryReserveKrw(rate = exchangeRate()): number {
  return summaryCostKrw(190_000, MAX_SUMMARY_OUTPUT_TOKENS, rate)
}

export function speechReserveKrw(rate = exchangeRate()): number {
  return speechCostKrw(MAX_SPEECH_CHARS, rate)
}
