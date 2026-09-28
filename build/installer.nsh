; MindZ installer - language-dependent strings
; 2052 = zh_CN, 1033 = en_US

LangString shortcutName 2052 "MindZ 思维导图"
LangString shortcutName 1033 "MindZ MindMap"

LangString uninstallDisplayName 2052 "MindZ 思维导图"
LangString uninstallDisplayName 1033 "MindZ MindMap"

!macro customInstall
  ; Overwrite registry entries with language-correct values
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayName "$(uninstallDisplayName)"
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" ShortcutName "$(shortcutName)"
!macroend
