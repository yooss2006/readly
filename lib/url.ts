const trackingKeys = new Set(['fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid'])

export function normalizeArticleUrl(input: string): string {
  if (input.length > 4096) throw new Error('URL이 너무 깁니다.')
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('올바른 URL을 입력해 주세요.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('공개 HTTP 또는 HTTPS 글 URL만 사용할 수 있습니다.')
  }
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host === '0.0.0.0' || host === '::1' || host.startsWith('127.') ||
    host.startsWith('10.') || host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) || host.startsWith('[') ||
    (url.port && !['80', '443'].includes(url.port))
  ) throw new Error('공개 웹 글 URL만 사용할 수 있습니다.')
  if (/\.pdf$/i.test(url.pathname)) throw new Error('PDF URL은 아직 지원하지 않습니다.')
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || trackingKeys.has(key.toLowerCase())) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}
