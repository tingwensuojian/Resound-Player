#include "window_utils.h"
#include <commctrl.h>

TaskbarInfo QueryTaskbarInfo(HWND hwndTaskbar) {
  TaskbarInfo info = {};
  if (!hwndTaskbar || !IsWindow(hwndTaskbar)) return info;
  APPBARDATA abd = {};
  abd.cbSize = sizeof(APPBARDATA);
  abd.hWnd = hwndTaskbar;
  if (SHAppBarMessage(ABM_GETTASKBARPOS, &abd)) {
    info.edge = abd.uEdge;
    info.rect = abd.rc;
  }
  APPBARDATA abdState = {};
  abdState.cbSize = sizeof(APPBARDATA);
  abdState.hWnd = hwndTaskbar;
  info.autoHide = (SHAppBarMessage(ABM_GETSTATE, &abdState) & ABS_AUTOHIDE) != 0;
  info.visible = IsWindowVisible(hwndTaskbar);
  return info;
}

bool IsTaskbarDarkTheme() {
  HKEY hKey;
  if (RegOpenKeyExW(HKEY_CURRENT_USER,
      L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
      0, KEY_READ, &hKey) == ERROR_SUCCESS) {
    DWORD value = 0, size = sizeof(DWORD), type = REG_DWORD;
    bool isDark = false;
    if (RegQueryValueExW(hKey, L"SystemUsesLightTheme",
        nullptr, &type, (LPBYTE)&value, &size) == ERROR_SUCCESS) {
      isDark = (value == 0);
    }
    if (RegQueryValueExW(hKey, L"AppsUseLightTheme",
        nullptr, &type, (LPBYTE)&value, &size) == ERROR_SUCCESS) {
      isDark = isDark || (value == 0);
    }
    RegCloseKey(hKey);
    return isDark;
  }
  return false;
}

HWND FindShellTaskbar() {
  return FindWindowW(L"Shell_TrayWnd", nullptr);
}

// JS: findTaskbar()
Napi::Value JsFindTaskbar(const Napi::CallbackInfo& info) {
  HWND hwnd = FindShellTaskbar();
  return Napi::Number::New(info.Env(), (int64_t)hwnd);
}

// JS: getWindowRect(hwnd)
Napi::Value JsGetWindowRect(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber())
    return env.Undefined();
  HWND hwnd = (HWND)(int64_t)info[0].As<Napi::Number>();
  if (!IsWindow(hwnd)) return env.Undefined();
  RECT r;
  if (!GetWindowRect(hwnd, &r)) return env.Undefined();
  Napi::Object result = Napi::Object::New(env);
  result.Set("x", Napi::Number::New(env, r.left));
  result.Set("y", Napi::Number::New(env, r.top));
  result.Set("width", Napi::Number::New(env, r.right - r.left));
  result.Set("height", Napi::Number::New(env, r.bottom - r.top));
  return result;
}

// JS: setWidgetStyles(hwndBuffer)
Napi::Value JsSetWidgetStyles(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer())
    return Napi::Boolean::New(env, false);
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr))
    return Napi::Boolean::New(env, false);
  LONG_PTR exStyle = GetWindowLongPtrW(*hwndPtr, GWL_EXSTYLE);
  SetWindowLongPtrW(*hwndPtr, GWL_EXSTYLE,
    exStyle | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_LAYERED);
  SetWindowPos(*hwndPtr, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  return Napi::Boolean::New(env, true);
}

// JS: setOwner(hwnd, ownerHwnd)
Napi::Value JsSetOwner(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2) return Napi::Boolean::New(env, false);
  HWND hwnd = (HWND)(int64_t)info[0].As<Napi::Number>();
  HWND owner = (HWND)(int64_t)info[1].As<Napi::Number>();
  if (!IsWindow(hwnd)) return Napi::Boolean::New(env, false);
  SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, (LONG_PTR)owner);
  return Napi::Boolean::New(env, true);
}

// JS: refreshCursor()
Napi::Value JsRefreshCursor(const Napi::CallbackInfo& info) {
  POINT pt;
  GetCursorPos(&pt);
  SetCursorPos(pt.x, pt.y);
  return info.Env().Undefined();
}

// JS: ensureAboveTaskbar(hwndBuffer | hwndNum)
Napi::Value JsEnsureAboveTaskbar(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1) return Napi::Boolean::New(env, false);
  HWND hwnd;
  if (info[0].IsBuffer()) {
    HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
    if (!hwndPtr) return Napi::Boolean::New(env, false);
    hwnd = *hwndPtr;
  } else if (info[0].IsNumber()) {
    hwnd = (HWND)(int64_t)info[0].As<Napi::Number>();
  } else {
    return Napi::Boolean::New(env, false);
  }
  if (!IsWindow(hwnd)) return Napi::Boolean::New(env, false);
  SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING);
  if (!IsWindowVisible(hwnd))
    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
  return Napi::Boolean::New(env, true);
}


// --- PreventHide subclass ---
static LRESULT CALLBACK PreventHideSubclassProc(HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam, UINT_PTR uIdSubclass, DWORD_PTR dwRefData) {
  switch (uMsg) {
    case WM_SHOWWINDOW:
      if (wParam == FALSE) return 0; // Block hide
      break;
    case WM_WINDOWPOSCHANGING: {
      WINDOWPOS* wp = (WINDOWPOS*)lParam;
      if ((wp->flags & SWP_HIDEWINDOW) && !(wp->flags & SWP_SHOWWINDOW))
        return 0; // Block hide via position change
      break;
    }
    case WM_ACTIVATEAPP:
      // Block activation change notification - prevents Electron
      // from hiding the widget when taskbar or other apps are clicked.
      return 0;
    case WM_WINDOWPOSCHANGED: {
      // After any position change, ensure we stay at HWND_TOPMOST
      WINDOWPOS* wp = (WINDOWPOS*)lParam;
      if (!(wp->flags & SWP_NOZORDER)) {
        SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING);
      }
      break;
    }
  }
  return DefSubclassProc(hWnd, uMsg, wParam, lParam);
}

// JS: embedInTaskbar(hwndBuffer) - sets widget as child of Shell_TrayWnd
Napi::Value JsEmbedInTaskbar(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer())
    return Napi::Boolean::New(env, false);
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr))
    return Napi::Boolean::New(env, false);
  
  HWND hwndTaskbar = FindShellTaskbar();
  if (!hwndTaskbar) return Napi::Boolean::New(env, false);
  
  // Set as child of taskbar (matching SodaMusic approach)
  SetWindowLongPtrW(*hwndPtr, GWLP_HWNDPARENT, (LONG_PTR)hwndTaskbar);
  // Ensure widget stays above taskbar
  SetWindowPos(*hwndPtr, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  return Napi::Boolean::New(env, true);
}

// JS: removeFromTaskbar(hwndBuffer) - removes widget from being child of Shell_TrayWnd
Napi::Value JsRemoveFromTaskbar(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer())
    return Napi::Boolean::New(env, false);
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr))
    return Napi::Boolean::New(env, false);
  
  HWND hwndTaskbar = FindShellTaskbar();
  if (!hwndTaskbar) return Napi::Boolean::New(env, false);
  
  // Only remove if current parent is Shell_TrayWnd
  if (GetWindowLongPtrW(*hwndPtr, GWLP_HWNDPARENT) == (LONG_PTR)hwndTaskbar) {
    SetWindowLongPtrW(*hwndPtr, GWLP_HWNDPARENT, 0);
  }
  return Napi::Boolean::New(env, true);
}

// JS: installPreventHide(hwndBuffer) - installs subclass to block WM_SHOWWINDOW/WM_WINDOWPOSCHANGING
Napi::Value JsInstallPreventHide(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer())
    return Napi::Boolean::New(env, false);
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr))
    return Napi::Boolean::New(env, false);
  
  BOOL result = SetWindowSubclass(*hwndPtr, PreventHideSubclassProc, 3, 0);
  return Napi::Boolean::New(env, result != FALSE);
}

// JS: removePreventHide(hwndBuffer) - removes the prevent-hide subclass
Napi::Value JsRemovePreventHide(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer())
    return Napi::Boolean::New(env, false);
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr))
    return Napi::Boolean::New(env, false);
  
  BOOL result = RemoveWindowSubclass(*hwndPtr, PreventHideSubclassProc, 3);
  return Napi::Boolean::New(env, result != FALSE);
}

// JS: startWindowDrag(hwndBuffer) - initiates native window drag from current cursor position
Napi::Value JsStartWindowDrag(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer())
    return Napi::Boolean::New(env, false);
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr))
    return Napi::Boolean::New(env, false);

  ReleaseCapture();
  POINT pt;
  GetCursorPos(&pt);
  PostMessage(*hwndPtr, WM_NCLBUTTONDOWN, HTCAPTION, MAKELPARAM(pt.x, pt.y));
  return Napi::Boolean::New(env, true);
}

// JS: getCursorPos() - returns {x, y} of current cursor position
Napi::Value JsGetCursorPos(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  POINT pt;
  if (!GetCursorPos(&pt)) {
    return env.Undefined();
  }
  Napi::Object result = Napi::Object::New(env);
  result.Set("x", Napi::Number::New(env, pt.x));
  result.Set("y", Napi::Number::New(env, pt.y));
  return result;
}

// JS: isMouseButtonDown(button) - checks if a mouse button is currently pressed
Napi::Value JsIsMouseButtonDown(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int button = 0;
  if (info.Length() > 0 && info[0].IsNumber()) {
    button = info[0].As<Napi::Number>().Int32Value();
  }
  int vk = VK_LBUTTON;
  if (button == 1) vk = VK_RBUTTON;
  else if (button == 2) vk = VK_MBUTTON;
  return Napi::Boolean::New(env, (GetAsyncKeyState(vk) & 0x8000) != 0);
}

Napi::Object RegisterWindowUtils(Napi::Env env, Napi::Object exports) {
  exports.Set("findTaskbar", Napi::Function::New(env, JsFindTaskbar));
  exports.Set("getWindowRect", Napi::Function::New(env, JsGetWindowRect));
  exports.Set("setWidgetStyles", Napi::Function::New(env, JsSetWidgetStyles));
  exports.Set("setOwner", Napi::Function::New(env, JsSetOwner));
  exports.Set("refreshCursor", Napi::Function::New(env, JsRefreshCursor));
  exports.Set("ensureAboveTaskbar", Napi::Function::New(env, JsEnsureAboveTaskbar));
  exports.Set("embedInTaskbar", Napi::Function::New(env, JsEmbedInTaskbar));
  exports.Set("removeFromTaskbar", Napi::Function::New(env, JsRemoveFromTaskbar));
  exports.Set("installPreventHide", Napi::Function::New(env, JsInstallPreventHide));
  exports.Set("removePreventHide", Napi::Function::New(env, JsRemovePreventHide));
  exports.Set("startWindowDrag", Napi::Function::New(env, JsStartWindowDrag));
  exports.Set("getCursorPos", Napi::Function::New(env, JsGetCursorPos));
  exports.Set("isMouseButtonDown", Napi::Function::New(env, JsIsMouseButtonDown));
  return exports;
}
