# 🚀 SafePatrol 100% 무료 배포 & 환경 설정 안내서

이 시스템은 **유료 구독이나 신용카드 등록이 전혀 필요 없는 100% 무료 조합**으로 설계되었습니다.
아래 단계에 따라 15~20분이면 점검용 링크 생성을 완료할 수 있습니다.

---

## 1단계: GitHub 저장소 만들기 (무료)

GitHub에 로그인한 뒤 **저장소 2개**를 생성합니다:

1. **`safepatrol-app` (공개 Public 저장소)**
   - 웹앱 프론트엔드가 호스팅될 저장소입니다.
   - `JS AIC/app/` 폴더 내의 파일들을 이 저장소에 푸시합니다.
   - **GitHub Pages 설정**: 저장소 설정(`Settings`) -> `Pages` -> Source를 `Deploy from a branch` (main branch)로 선택
   - 잠시 후 `https://<내아이디>.github.io/safepatrol-app/` 형태의 무료 웹앱 접속 주소가 발급됩니다.

2. **`safepatrol-data-2026` (비공개 Private 저장소)**
   - 현장 사진, JSON 부적합 대장 데이터가 안전하게 누적될 저장소입니다.
   - 반드시 **Private**으로 생성합니다.

3. **Personal Access Token (PAT) 발급**
   - GitHub 우측 상단 프로필 -> `Settings` -> 맨 밑 `Developer Settings` -> `Personal access tokens` -> `Tokens (classic)`
   - `Generate new token (classic)` 클릭 -> 권한(`repo` 전체 체크) -> 토큰 값 복사해두기.

---

## 2단계: Cloudflare Workers 중계 배포 (무료)

GitHub 토큰을 브라우저에 노출시키지 않고 점검자 PIN 번호 인증을 수행하기 위해 사용합니다.

1. [Cloudflare 대시보드](https://dash.cloudflare.com/) 무료 가입 및 로그인 (카드 등록 불필요)
2. 좌측 메뉴 `Workers & Pages` -> `Create application` -> `Create Worker`
3. Worker 이름 입력 (예: `safepatrol-api`) -> `Deploy`
4. 배포 후 `Edit code` 버튼 클릭 -> `JS AIC/worker/index.js` 내용을 전체 복사하여 붙여넣고 `Deploy`
5. `Settings` -> `Variables and Secrets`에서 아래 환경변수를 등록합니다:
   - `GITHUB_TOKEN`: 1단계에서 발급한 GitHub 토큰 값 (Type: Secret)
   - `GITHUB_OWNER`: 내 GitHub 아이디
   - `GITHUB_REPO`: `safepatrol-data-2026`
   - `PINS_JSON`:
     ```json
     {
       "111111": { "name": "점검자1", "role": "inspector" },
       "222222": { "name": "점검자2", "role": "inspector" },
       "000000": { "name": "관리자", "role": "admin" }
     }
     ```
     *(PIN 번호 및 이름은 원하시는 번호로 언제든 수정 가능합니다)*
6. Worker 주소 확인: `https://safepatrol-api.<본인서브도메인>.workers.dev`

---

## 3단계: 웹앱에 Worker 주소 연결

`app/index.html` 의 `<head>` 영역에 한 줄을 추가하거나 스크립트로 주소를 지정합니다:
```html
<script>
  window.SAFEPATROL_CONFIG = {
    workerUrl: 'https://safepatrol-api.<본인서브도메인>.workers.dev'
  };
</script>
```
*(위 설정을 넣지 않으면 브라우저 자체 IndexedDB를 사용하는 **데모 체험 모드**로 즉시 작동합니다.)*

---

## 4단계: 모바일 홈 화면 추가 (앱처럼 쓰기)

- 스마트폰 브라우저(사파리 또는 크롬)로 발급된 GitHub Pages 링크 접속
- 브라우저 메뉴의 **[홈 화면에 추가]** 클릭
- 앱 아이콘이 스마트폰 바탕화면에 생성되어 앱스토어 설치 없이 네이티브 앱처럼 1초 만에 실행됩니다.
