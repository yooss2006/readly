# Readly

Readly는 초대된 사용자가 공개 웹 글을 한국어로 요약하고 음성으로 들을 수 있는 웹 앱입니다. 같은 URL의 요약과 음성은 사용자들이 함께 이용합니다.

## 시작하기

1. `npm install`을 실행합니다.
2. Supabase 프로젝트에서 Google 로그인을 켭니다. Google OAuth에 Supabase가 표시하는 콜백 URL을 등록합니다. Supabase Auth의 Site URL은 로컬에서 `http://localhost:3000`, Redirect URLs에는 `http://localhost:3000/auth/callback`을 추가합니다. 배포할 때는 Vercel 주소와 `/auth/callback`도 추가합니다.
3. Supabase SQL Editor에서 [초기 마이그레이션](supabase/migrations/202609230001_initial.sql)을 실행합니다. 초대할 이메일을 다음처럼 등록합니다.

   ```sql
   insert into public.allowed_emails(email) values (lower('person@example.com'));
   ```

4. `.env.example`을 `.env`로 복사하고 값을 채웁니다. Supabase 프로젝트의 URL과 publishable key는 공개 설정이며, secret key는 서버 전용 비밀값입니다. OpenAI와 Firecrawl 키도 서버에서만 사용합니다. 키를 채팅이나 Git에 넣지 마세요.
   기존 로컬 파일에 `OPENAPI_KEY`와 `FIRECRAWL_KEY`가 있다면 앱이 각각 OpenAI와 Firecrawl 키의 별칭으로 읽습니다. 새 설정에는 아래 표의 이름을 사용하세요.
5. `npm run dev`를 실행하고 `http://localhost:3000`을 엽니다.

| 환경 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | 서버의 DB 함수·Storage 호출. 기존 `SUPABASE_SERVICE_ROLE_KEY`도 지원 |
| `FIRECRAWL_API_KEY` | 공개 글 본문 추출 |
| `OPENAI_API_KEY` | 요약과 음성 생성 |
| `USD_KRW_RATE` | 비용 계산용 보수적 원/USD 환산율. 기본값 1700 |

## 테스트

`npm test`는 URL·비용 규칙과 실제 로컬 PostgreSQL의 동시 요청, 초대 제한, 일일·월 한도, 부분 성공을 검사합니다. PostgreSQL의 `initdb`, `pg_ctl`, `psql`이 없으면 DB 테스트는 건너뜁니다. `npm run typecheck`와 `npm run build`로 TypeScript와 프로덕션 빌드를 확인합니다.

외부 키를 설정한 뒤 `npm run smoke`로 실제 공개 글을 추출하고 OpenAI 요약·음성 생성을 확인합니다. 이 작업은 API 사용량을 소비합니다. 출력된 요약에서 원문의 핵심과 수치·조건·부정 표현이 보존됐는지 직접 확인하세요.

## 배포

Vercel Hobby에서 이 저장소를 Next.js 프로젝트로 연결하고 위 환경 변수를 등록합니다. Supabase Auth에 배포 도메인과 `/auth/callback`을 등록한 뒤 배포합니다. 배포된 앱에서 초대 계정 로그인, 요약, 음성, 결과 재조회, 비초대 계정 거절을 확인합니다.

OpenAI API 프로젝트의 **강제 월 지출 한도**는 앱의 24,000원 중단 지점보다 낮게 설정하고, 그보다 앞선 지출 알림도 등록합니다. 강제 한도는 적용 지연으로 소액 초과할 수 있습니다. Firecrawl 무료 크레딧이 소진되면 새 본문 추출을 중단합니다. 크레딧이 복구되면 Supabase SQL Editor에서 `update public.app_state set firecrawl_paused = false where id = true;`를 실행합니다.

제품 범위는 [기획 기록](docs/ADR.md), 모델·비용·동시성 선택은 [기술 결정 기록](docs/TECHNICAL_DECISIONS.md)을 참고하세요.
