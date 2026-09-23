import './globals.css'

export const metadata = {
  title: 'Readly',
  description: '공개 웹 글을 한국어로 요약하고 음성으로 듣습니다.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>
}
