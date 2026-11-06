; electron-builder NSIS 사용자 정의 스크립트

!ifndef BUILD_UNINSTALLER
  ; 설치 완료 화면에 "바탕화면에 바로 가기 만들기" 체크박스(기본 선택)를 추가한다.
  ; 자동 업데이트(조용한 설치)에서는 완료 화면이 없으므로 바로 가기를 건드리지 않는다.
  Function CreateDesktopShortcut
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  FunctionEnd
  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "바탕화면에 바로 가기 만들기"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut
!endif

!macro customUnInstall
  ; 업데이트 중에는 바로 가기를 유지하고, 실제 제거할 때만 지운다
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  ${endIf}
!macroend
