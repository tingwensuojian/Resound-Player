#include "taskbar_widget.h"

static const wchar_t* WIDGET_CLASS_NAME = L"ResoundTaskbarWidget";

Napi::Object TaskbarWidget::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "TaskbarWidget", {
    InstanceMethod("getTaskbarInfo", &TaskbarWidget::GetTaskbarInfo),
    InstanceMethod("findTaskbar", &TaskbarWidget::FindTaskbar),
    InstanceMethod("ensureAboveTaskbar", &TaskbarWidget::EnsureAboveTaskbar),
    InstanceMethod("getTaskbarTheme", &TaskbarWidget::GetTaskbarTheme),
    InstanceMethod("getNativeHwnd", &TaskbarWidget::GetNativeHwnd),
    InstanceMethod("setWidgetPosition", &TaskbarWidget::SetWidgetPosition),
    InstanceMethod("setWidgetSize", &TaskbarWidget::SetWidgetSize),
    InstanceMethod("setAlpha", &TaskbarWidget::SetAlpha),
    InstanceMethod("onTaskbarThemeChanged", &TaskbarWidget::OnTaskbarThemeChanged),
    InstanceMethod("onTaskbarMoved", &TaskbarWidget::OnTaskbarMoved),
    InstanceMethod("destroy", &TaskbarWidget::Destroy),
    InstanceMethod("protectExternalWindow", &TaskbarWidget::ProtectExternalWindow),
    InstanceMethod("keepExternalWindowTopmost", &TaskbarWidget::KeepExternalWindowTopmost),
    InstanceMethod("stopKeepExternalWindowTopmost", &TaskbarWidget::StopKeepExternalWindowTopmost),
    InstanceMethod("setChildWindow", &TaskbarWidget::SetChildWindow),
    InstanceMethod("preventHide", &TaskbarWidget::PreventHide),
  });

  Napi::FunctionReference* constructor = new Napi::FunctionReference();
  *constructor = Napi::Persistent(func);
  env.SetInstanceData(constructor);

  exports.Set("TaskbarWidget", func);
  return exports;
}

TaskbarWidget::TaskbarWidget(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<TaskbarWidget>(info) {
  int x = info[0].As<Napi::Number>().Int32Value();
  int y = info[1].As<Napi::Number>().Int32Value();
  int w = info[2].As<Napi::Number>().Int32Value();
  int h = info[3].As<Napi::Number>().Int32Value();
  widgetWidth_ = w;
  widgetHeight_ = h;

  hwndTaskbar_ = FindWindowW(L"Shell_TrayWnd", nullptr);
  hwndWidget_ = CreateWidgetWindow(x, y, w, h);

  running_ = true;
  StartTrackerThread();
  StartThemeMonitor();
}

TaskbarWidget::~TaskbarWidget() {
  running_ = false;
  keepTopmostRunning_ = false;
  if (keepTopmostThread_.joinable()) keepTopmostThread_.join();
  StopTrackerThread();
  StopThemeMonitor();
  if (hwndWidget_ && IsWindow(hwndWidget_)) {
    DestroyWindow(hwndWidget_);
    hwndWidget_ = nullptr;
  }
  if (themeCallback_) { themeCallback_.Release(); themeCallback_ = nullptr; }
  if (movedCallback_) { movedCallback_.Release(); movedCallback_ = nullptr; }
}

HWND TaskbarWidget::CreateWidgetWindow(int x, int y, int width, int height) {
  HINSTANCE hInstance = GetModuleHandleW(nullptr);

  static bool classRegistered = false;
  if (!classRegistered) {
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(WNDCLASSEXW);
    wc.lpfnWndProc = DefWindowProcW;
    wc.hInstance = hInstance;
    wc.hbrBackground = (HBRUSH)GetStockObject(NULL_BRUSH);
    RegisterClassExW(&wc);
    classRegistered = true;
  }

  HWND hwnd = CreateWindowExW(
    WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW,
    WIDGET_CLASS_NAME,
    L"ResoundPlayerWidget",
    WS_POPUP,
    x, y, width, height,
    nullptr, nullptr, hInstance, nullptr
  );

  if (!hwnd) return nullptr;

  // SetLayeredWindowAttributes removed - use WS_EX_TRANSPARENT for click-through instead of alpha=0 which breaks child window rendering
  SetWindowPos(hwnd, HWND_TOPMOST, x, y, width, height,
    SWP_NOACTIVATE | SWP_SHOWWINDOW);

  return hwnd;
}

TaskbarInfo TaskbarWidget::QueryTaskbarInfo() {
  TaskbarInfo info = {};
  if (!hwndTaskbar_ || !IsWindow(hwndTaskbar_)) {
    hwndTaskbar_ = FindWindowW(L"Shell_TrayWnd", nullptr);
  }
  if (!hwndTaskbar_) return info;

  APPBARDATA abd = {};
  abd.cbSize = sizeof(APPBARDATA);
  abd.hWnd = hwndTaskbar_;
  if (SHAppBarMessage(ABM_GETTASKBARPOS, &abd)) {
    info.edge = abd.uEdge;
    info.rect = abd.rc;
  }

  APPBARDATA abdState = {};
  abdState.cbSize = sizeof(APPBARDATA);
  abdState.hWnd = hwndTaskbar_;
  info.autoHide = (SHAppBarMessage(ABM_GETSTATE, &abdState) & ABS_AUTOHIDE) != 0;
  info.visible = IsWindowVisible(hwndTaskbar_);
  return info;
}

bool TaskbarWidget::IsDarkTheme() {
  HKEY hKey;
  if (RegOpenKeyExW(HKEY_CURRENT_USER,
      L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
      0, KEY_READ, &hKey) == ERROR_SUCCESS) {
    DWORD value = 0, size = sizeof(DWORD), type = REG_DWORD;
    if (RegQueryValueExW(hKey, L"SystemUsesLightTheme",
        nullptr, &type, reinterpret_cast<LPBYTE>(&value), &size) == ERROR_SUCCESS) {
      RegCloseKey(hKey);
      return value == 0;
    }
    RegCloseKey(hKey);
  }
  return false;
}

// JS: getTaskbarInfo()
Napi::Value TaskbarWidget::GetTaskbarInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  TaskbarInfo tb = QueryTaskbarInfo();
  Napi::Object result = Napi::Object::New(env);
  Napi::Object rect = Napi::Object::New(env);
  rect.Set("left", Napi::Number::New(env, tb.rect.left));
  rect.Set("top", Napi::Number::New(env, tb.rect.top));
  rect.Set("right", Napi::Number::New(env, tb.rect.right));
  rect.Set("bottom", Napi::Number::New(env, tb.rect.bottom));
  result.Set("rect", rect);
  result.Set("edge", Napi::Number::New(env, tb.edge));
  result.Set("autoHide", Napi::Boolean::New(env, tb.autoHide));
  result.Set("visible", Napi::Boolean::New(env, tb.visible));
  return result;
}

// JS: findTaskbar()
Napi::Value TaskbarWidget::FindTaskbar(const Napi::CallbackInfo& info) {
  hwndTaskbar_ = FindWindowW(L"Shell_TrayWnd", nullptr);
  return Napi::Number::New(info.Env(), reinterpret_cast<int64_t>(hwndTaskbar_));
}

// JS: ensureAboveTaskbar()
Napi::Value TaskbarWidget::EnsureAboveTaskbar(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!hwndWidget_ || !IsWindow(hwndWidget_))
    return Napi::Boolean::New(env, false);

  TaskbarInfo tb = QueryTaskbarInfo();
  if (!tb.visible)
    return Napi::Boolean::New(env, false);

  RECT wr;
  GetWindowRect(hwndWidget_, &wr);
  int w = wr.right - wr.left;
  int h = wr.bottom - wr.top;
  int x, y;

  switch (tb.edge) {
    case ABE_BOTTOM:
      x = tb.rect.right - w - 16;
      y = tb.rect.top - h - 4;
      break;
    case ABE_TOP:
      x = tb.rect.right - w - 16;
      y = tb.rect.bottom + 4;
      break;
    case ABE_LEFT:
      x = tb.rect.right + 4;
      y = tb.rect.bottom - h - 8;
      break;
    case ABE_RIGHT:
      x = tb.rect.left - w - 4;
      y = tb.rect.bottom - h - 8;
      break;
    default:
      x = tb.rect.right - w - 16;
      y = tb.rect.top - h - 4;
  }

  SetWindowPos(hwndWidget_, HWND_TOPMOST, x, y, 0, 0,
    SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING);
  return Napi::Boolean::New(env, true);
}

// JS: getTaskbarTheme()
Napi::Value TaskbarWidget::GetTaskbarTheme(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), IsDarkTheme());
}

// JS: getNativeHwnd()
Napi::Value TaskbarWidget::GetNativeHwnd(const Napi::CallbackInfo& info) {
  HWND hwnd = hwndWidget_;
  return Napi::Buffer<HWND>::Copy(info.Env(), &hwnd, 1);
}

// JS: setWidgetPosition(x, y)
void TaskbarWidget::SetWidgetPosition(const Napi::CallbackInfo& info) {
  int x = info[0].As<Napi::Number>().Int32Value();
  int y = info[1].As<Napi::Number>().Int32Value();
  if (hwndWidget_ && IsWindow(hwndWidget_)) {
    SetWindowPos(hwndWidget_, HWND_TOPMOST, x, y, 0, 0,
      SWP_NOSIZE | SWP_NOACTIVATE);
  }
}

// JS: setWidgetSize(w, h)
void TaskbarWidget::SetWidgetSize(const Napi::CallbackInfo& info) {
  int w = info[0].As<Napi::Number>().Int32Value();
  int h = info[1].As<Napi::Number>().Int32Value();
  widgetWidth_ = w;
  widgetHeight_ = h;
  if (hwndWidget_ && IsWindow(hwndWidget_)) {
    SetWindowPos(hwndWidget_, nullptr, 0, 0, w, h,
      SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
  }
}

// JS: setAlpha(alpha)
void TaskbarWidget::SetAlpha(const Napi::CallbackInfo& info) {
  int alpha = info[0].As<Napi::Number>().Int32Value();
  if (hwndWidget_ && IsWindow(hwndWidget_)) {
    SetLayeredWindowAttributes(hwndWidget_, RGB(0, 0, 0),
      static_cast<BYTE>(alpha), LWA_ALPHA);
  }
}

// JS: onTaskbarThemeChanged(callback)
void TaskbarWidget::OnTaskbarThemeChanged(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (themeCallback_) themeCallback_.Release();
  themeCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(),
    "ThemeCallback", 0, 1);
}

// JS: onTaskbarMoved(callback)
void TaskbarWidget::OnTaskbarMoved(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (movedCallback_) movedCallback_.Release();
  movedCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(),
    "MovedCallback", 0, 1);
}

// Tracker thread: 500ms poll taskbar position
void TaskbarWidget::StartTrackerThread() {
  trackerThread_ = std::thread([this]() {
    RECT lastRect = {};
    UINT lastEdge = 0;
    while (running_) {
      TaskbarInfo info = QueryTaskbarInfo();
      if (memcmp(&info.rect, &lastRect, sizeof(RECT)) != 0 || info.edge != lastEdge) {
        lastRect = info.rect;
        lastEdge = info.edge;
        if (movedCallback_) {
          movedCallback_.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
            cb.Call({});
          });
        }
      }
      Sleep(500);
    }
  });
}

void TaskbarWidget::StopTrackerThread() {
  if (trackerThread_.joinable()) trackerThread_.join();
}

// Theme monitor thread
void TaskbarWidget::StartThemeMonitor() {
  themeMonitorThread_ = std::thread([this]() {
    HKEY hKey;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        0, KEY_NOTIFY, &hKey) != ERROR_SUCCESS) return;

    HANDLE hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    bool lastDark = IsDarkTheme();

    while (running_) {
      RegNotifyChangeKeyValue(hKey, FALSE, REG_NOTIFY_CHANGE_LAST_SET, hEvent, TRUE);
      if (WaitForSingleObject(hEvent, 1000) == WAIT_OBJECT_0) {
        ResetEvent(hEvent);
        bool isDark = IsDarkTheme();
        if (isDark != lastDark) {
          lastDark = isDark;
          if (themeCallback_) {
            themeCallback_.NonBlockingCall([isDark](Napi::Env env, Napi::Function cb) {
              cb.Call({Napi::Boolean::New(env, isDark)});
            });
          }
        }
      }
    }
    CloseHandle(hEvent);
    RegCloseKey(hKey);
  });
}

void TaskbarWidget::StopThemeMonitor() {
  if (themeMonitorThread_.joinable()) themeMonitorThread_.join();
}

// JS: setChildWindow(hwndBuffer) - 灏?Electron 绐楀彛璁句负鍘熺敓绐楀彛鐨勫瓙绐楀彛
// 瀛愮獥鍙ｉ殢鐖剁獥鍙ｇ殑 HWND_TOPMOST 鑷姩淇濇寔鍦ㄩ《灞傦紝鏃犻渶浠讳綍杞
Napi::Value TaskbarWidget::SetChildWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer (HWND)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr) || !hwndWidget_ || !IsWindow(hwndWidget_)) {
    return Napi::Boolean::New(env, false);
  }
  // 灏?Electron 绐楀彛璁句负鍘熺敓绐楀彛鐨勫瓙绐楀彛
  SetParent(*hwndPtr, hwndWidget_);
  // 娆?SetParent 鍚庯紝纭繚瀛愮獥鍙ｅ彲瑙?+ WS_EX_NOACTIVATE 闃叉琚换鍔℃爮浜や簰闅愯棌
  ShowWindow(*hwndPtr, SW_SHOWNOACTIVATE);
  SetWindowPos(*hwndPtr, nullptr, 0, 0, 0, 0,
    SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOZORDER);
  // 璁剧疆瀛愮獥鍙ｆ墿灞曟牱寮?
  LONG_PTR childExStyle = GetWindowLongPtrW(*hwndPtr, GWL_EXSTYLE);
  SetWindowLongPtrW(*hwndPtr, GWL_EXSTYLE, childExStyle | WS_EX_NOACTIVATE);
  // 鐖剁獥鍙ｅ凡缁忔槸 HWND_TOPMOST锛屽瓙绐楀彛鑷姩璺熼殢
  return Napi::Boolean::New(env, true);
}

// JS: protectExternalWindow(hwndBuffer)
// Accepts Electron getNativeWindowHandle() buffer, applies WS_EX_TOPMOST + WS_EX_NOACTIVATE
Napi::Value TaskbarWidget::ProtectExternalWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer (HWND)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr)) {
    return Napi::Boolean::New(env, false);
  }
  hwndExternal_ = *hwndPtr;
  // Add WS_EX_NOACTIVATE to prevent activation on click
  LONG_PTR exStyle = GetWindowLongPtrW(hwndExternal_, GWL_EXSTYLE);
  SetWindowLongPtrW(hwndExternal_, GWL_EXSTYLE, exStyle | WS_EX_NOACTIVATE | WS_EX_TOPMOST);
  // Force topmost position
  SetWindowPos(hwndExternal_, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING);
  return Napi::Boolean::New(env, true);
}

// JS: stopKeepExternalWindowTopmost()
// Stops the native keep-topmost thread
void TaskbarWidget::StopKeepExternalWindowTopmost(const Napi::CallbackInfo& info) {
  keepTopmostRunning_ = false;
  if (keepTopmostThread_.joinable()) keepTopmostThread_.join();
}

// JS: keepExternalWindowTopmost(hwndBuffer, intervalMs)
// Starts a native thread that keeps the external HWND at HWND_TOPMOST
Napi::Value TaskbarWidget::KeepExternalWindowTopmost(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer (HWND)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr)) {
    return Napi::Boolean::New(env, false);
  }
  HWND targetHwnd = *hwndPtr;
  if (info.Length() >= 2 && info[1].IsNumber()) {
    keepTopmostInterval_ = info[1].As<Napi::Number>().Int32Value();
  }
  // Stop existing thread if running
  if (keepTopmostRunning_) {
    keepTopmostRunning_ = false;
  keepTopmostRunning_ = false;
  if (keepTopmostThread_.joinable()) keepTopmostThread_.join();
    if (keepTopmostThread_.joinable()) keepTopmostThread_.join();
  }
  keepTopmostRunning_ = true;
  keepTopmostThread_ = std::thread([targetHwnd, this]() {
    while (keepTopmostRunning_) {
      if (IsWindow(targetHwnd)) {
        if (!IsWindowVisible(targetHwnd)) {
          ShowWindow(targetHwnd, SW_SHOWNOACTIVATE);
        }
        SetWindowPos(targetHwnd, HWND_TOPMOST, 0, 0, 0, 0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING);
        if (!IsWindowVisible(targetHwnd)) {
          ShowWindow(targetHwnd, SW_SHOWNOACTIVATE);
        }
      } else {
        break;
      }
      Sleep(keepTopmostInterval_);
    }
  });
  return Napi::Boolean::New(env, true);
}

// 子类化过程：阻止 Windows 隐藏窗口（汽水音乐方案）
LRESULT CALLBACK TaskbarWidget::PreventHideSubclassProc(
    HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam,
    UINT_PTR subclassId, DWORD_PTR /*refData*/) {
  if (msg == WM_SHOWWINDOW && !wParam) return 0;
  if (msg == WM_WINDOWPOSCHANGING) {
    WINDOWPOS* wp = reinterpret_cast<WINDOWPOS*>(lParam);
    if (wp->flags & SWP_HIDEWINDOW) {
      wp->flags &= ~SWP_HIDEWINDOW;
      wp->flags |= SWP_SHOWWINDOW;
      return 0;
    }
  }
  return DefSubclassProc(hwnd, msg, wParam, lParam);
}

// JS: preventHide(hwndBuffer)
Napi::Value TaskbarWidget::PreventHide(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer (HWND)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr))
    return Napi::Boolean::New(env, false);
  BOOL ok = SetWindowSubclass(*hwndPtr, PreventHideSubclassProc, 1,
    reinterpret_cast<DWORD_PTR>(this));
  return Napi::Boolean::New(env, ok);
}

// JS: destroy()
void TaskbarWidget::Destroy(const Napi::CallbackInfo& /*info*/) {
  running_ = false;
  keepTopmostRunning_ = false;
  if (keepTopmostThread_.joinable()) keepTopmostThread_.join();
  StopTrackerThread();
  StopThemeMonitor();
  if (hwndWidget_ && IsWindow(hwndWidget_)) {
    DestroyWindow(hwndWidget_);
    hwndWidget_ = nullptr;
  }
  if (themeCallback_) { themeCallback_.Release(); themeCallback_ = nullptr; }
  if (movedCallback_) { movedCallback_.Release(); movedCallback_ = nullptr; }
}
