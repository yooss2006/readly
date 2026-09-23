import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeArticleUrl } from '../lib/url'
import { speechCostKrw, speechReserveKrw, summaryCostKrw, summaryReserveKrw } from '../lib/cost'
import { speechText } from '../lib/external'

test('같은 글의 추적 파라미터와 조각은 동일 URL로 정리한다', () => {
  const a = normalizeArticleUrl('https://example.com/story/?b=2&utm_source=news&a=1#comments')
  const b = normalizeArticleUrl('https://example.com/story?a=1&b=2')
  assert.equal(a, b)
  assert.notEqual(normalizeArticleUrl('https://example.com/story?id=1'), normalizeArticleUrl('https://example.com/story?id=2'))
})

test('비공개 주소와 PDF는 본문 추출 전에 거절한다', () => {
  for (const url of ['http://localhost/a', 'http://127.0.0.1/a', 'http://192.168.1.4/a',
    'http://169.254.1.1/a', 'file:///etc/passwd', 'https://example.com/report.pdf']) {
    assert.throws(() => normalizeArticleUrl(url))
  }
})

test('예약 금액은 허용한 최대 입력과 출력을 감당한다', () => {
  const rate = 1700
  assert.ok(summaryReserveKrw(rate) >= summaryCostKrw(190_000, 1_200, rate))
  assert.ok(speechReserveKrw(rate) >= speechCostKrw(4_096, rate))
  assert.equal(speechCostKrw(1_000, rate), 26)
})

test('음성은 요약만 읽고 길이 한도를 확인한다', () => {
  assert.equal(speechText({ overview: '핵심', points: ['첫째', '둘째'] }), '핵심\n\n첫째\n\n둘째')
  assert.throws(() => speechText({ overview: '가'.repeat(4_097), points: [] }))
})
