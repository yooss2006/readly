import { scrapeArticle, speechText, summarizeArticle, synthesizeSpeech } from '../lib/external'

const url = process.env.SMOKE_URL || 'https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html'
async function main() {
  const article = await scrapeArticle(url)
  const result = await summarizeArticle(article.markdown, article.title)
  const speech = await synthesizeSpeech(speechText(result.summary))
  process.stdout.write(JSON.stringify({
    sourceUrl: url,
    title: article.title,
    sourceExcerpt: article.markdown.slice(0, 2500),
    summary: result.summary,
    summaryCostKrw: result.costKrw,
    audioBytes: speech.bytes.length,
    audioCostKrw: speech.costKrw,
  }, null, 2) + '\n')
}

main().catch(error => {
  process.stderr.write((error instanceof Error ? error.message : 'smoke test failed') + '\n')
  process.exitCode = 1
})
