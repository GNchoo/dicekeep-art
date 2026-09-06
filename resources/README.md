# resources/ — 앱 아이콘·스플래시 원본

`@capacitor/assets` 가 이 폴더의 그림으로 Android(`android/app/src/main/res/…`)·iOS(`ios/App/App/Assets.xcassets/…`) 아이콘과 스플래시를 만든다.

지금 들어 있는 파일은 **자리표시**(`ui/gold.png` 를 어두운 배경 가운데 놓은 것)다. Grok 으로 만든 진짜 그림을 **같은 파일명**으로 덮어쓴 뒤 아래 명령을 다시 돌리면 된다 (ART-PROMPTS.md 의 아이콘·스플래시 프롬프트 참고).

| 파일 | 크기 | 용도 |
|---|---|---|
| `icon-only.png` | 1024×1024, 불투명 | 일반 아이콘 (iOS · Android 구형). 모서리는 OS 가 깎으므로 꽉 채워 그린다 |
| `icon-foreground.png` | 1024×1024, 투명 배경 | Android 적응형 아이콘 전경. 중요한 그림은 가운데 66% 안에 |
| `icon-background.png` | 1024×1024, 불투명 | Android 적응형 아이콘 배경 (단색 `#1a140d` 또는 질감) |
| `splash.png` | 2732×2732 | 스플래시. 가운데 ~400px 로고만, 나머지는 배경색 `#0d0b09` (CENTER_CROP 으로 잘린다) |
| `splash-dark.png` | 2732×2732 | 다크 모드 스플래시 (같아도 된다) |

자리표시 다시 만들기: `node tools/make-resources.mjs`

생성 (android/·ios/ 가 있어야 한다):

```
npx @capacitor/assets generate --android --ios --assetPath resources --iconBackgroundColor '#1a140d' --iconBackgroundColorDark '#1a140d' --splashBackgroundColor '#0d0b09' --splashBackgroundColorDark '#0d0b09'
```

스토어용 512×512 아이콘·1024×500 피처 그래픽은 여기서 만들지 않는다 — STORE.md 스크린샷 목록 참고.
