# DirectorHome

`DirectorHome`은 가족용 서비스를 담는 우산 프로젝트입니다. 첫 서비스는 자녀 영단어 학습(JunsVoca,
아래 설명)이고, 두 번째로 가계부(월별 지출관리)가 추가되었습니다. 가계부는 홈 화면의 "가계부"
메뉴에서 비밀번호로 접근합니다.

초등학교 고학년~중학교 대비 영어 단어/숙어 학습을 위한 PWA 웹앱입니다.

영어 단어와 뜻을 직접 입력(붙여넣기)해서 단어장을 만들고, 스펠링 쓰기 / 뜻 쓰기 두 가지
유형의 문제를 랜덤으로 출제합니다. 문제 수(5/10/20/전체)와 유형(섞어서/영어→뜻/뜻→영어)을
고를 수 있고, 틀린 문제는 전부 맞을 때까지 반복 라운드로 다시 출제됩니다.
부모는 별도 기기에서도 테이블 형태로 학습 이력과 정답률을 확인할 수 있습니다 (서버 DB 공유).

## 단어 입력 형식

한 줄에 단어 하나씩 `번호 영단어 뜻` 순서로 입력합니다. 번호는 생략해도 되고, 구분자는
공백/탭/쉼표 모두 됩니다. 메모장이나 엑셀에서 복사해 붙여넣어도 됩니다.
입력하는 동안 인식 결과가 바로 미리보기로 나오고, 읽지 못한 줄은 따로 표시됩니다.

```
1 festival 축제
2 national holiday 국경일
20 episode (쇼의) 회
```

채점은 띄어쓰기/기호 차이를 무시하고, 뜻의 괄호 안 설명은 생략해도 정답으로 처리합니다.

화면 디자인 시안: 이 프로젝트의 Design 아티팩트 참고.

## 구성

- **프론트엔드**: Vite + React + TypeScript + Tailwind, PWA(installable)
- **백엔드**: Express (`server/`), 정적 빌드 결과물(`dist/`)도 같은 서버가 서빙
- **DB**: PostgreSQL (Neon 등 어떤 Postgres도 가능) — `DATABASE_URL` 환경변수 하나로 연결

## 로컬 개발

```bash
npm install
cp .env.example .env   # DATABASE_URL을 로컬/Neon 연결 문자열로 채우기
npm test                # 파서/채점 단위 테스트
npm run build           # 프론트엔드 빌드 (dist/)
npm start                # Express 서버 실행 (:3000) — API + 정적 파일 서빙
```

프론트엔드만 빠르게 수정하며 볼 때는 `npm run dev` (Vite dev 서버, `:5173`)를
쓰되, API 호출은 같은 오리진을 기대하므로 백엔드도 별도 포트로 함께 띄워두고
Vite 프록시 설정이 필요할 수 있습니다.

## 배포 (Render)

저장소 루트의 `render.yaml`을 Render의 **New → Blueprint**로 연결하면
빌드/실행 명령이 자동 설정됩니다. 배포 전 Render 대시보드에서
`DATABASE_URL` 환경변수에 Postgres(Neon) connection string만 넣어주면 됩니다.
