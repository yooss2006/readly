import { LoginButton } from './login-button'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return <main className="shell login-shell">
    <div className="brand">Readly<span className="brand-dot">.</span></div>
    <section className="login-card">
      <p className="eyebrow">읽기 전에, 먼저 이해하기</p>
      <h1>긴 글의 핵심을<br />가볍게 만나보세요.</h1>
      <p className="muted">공개 웹 글 URL을 넣으면 한국어 요약을 만들고, 필요하면 음성으로도 들을 수 있습니다.</p>
      <LoginButton />
      {error === 'not_invited' && <p className="error" role="alert">초대된 계정만 이용할 수 있습니다.</p>}
      {error === 'oauth' && <p className="error" role="alert">로그인을 완료하지 못했습니다. 다시 시도해 주세요.</p>}
      <p className="small-muted">초대된 Google 계정만 이용할 수 있습니다.</p>
    </section>
  </main>
}
