#pragma once
#include <napi.h>
#include <windows.h>
#include <shellapi.h>

struct TaskbarInfo {
  RECT rect;
  UINT edge;
  bool autoHide;
  bool visible;
};

Napi::Object RegisterWindowUtils(Napi::Env env, Napi::Object exports);
TaskbarInfo QueryTaskbarInfo(HWND hwndTaskbar);
bool IsTaskbarDarkTheme();
HWND FindShellTaskbar();
