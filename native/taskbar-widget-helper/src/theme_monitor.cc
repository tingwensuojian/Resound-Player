#include "theme_monitor.h"
#include "window_utils.h"

Napi::FunctionReference* themeMonitorConstructor = nullptr;

Napi::Object ThemeMonitor::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "ThemeMonitor", {
    InstanceMethod("getTheme", &ThemeMonitor::GetTheme),
    InstanceMethod("onThemeChanged", &ThemeMonitor::OnThemeChanged),
    InstanceMethod("destroy", &ThemeMonitor::Destroy),
  });
  themeMonitorConstructor = new Napi::FunctionReference();
  *themeMonitorConstructor = Napi::Persistent(func);
  env.SetInstanceData(themeMonitorConstructor);
  exports.Set("ThemeMonitor", func);
  return exports;
}

ThemeMonitor::ThemeMonitor(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ThemeMonitor>(info) {
  lastDark_ = IsTaskbarDarkTheme();
  running_ = true;
  StartMonitor();
}

ThemeMonitor::~ThemeMonitor() {
  StopMonitor();
  if (themeCallback_) { themeCallback_.Release(); themeCallback_ = nullptr; }
}

Napi::Value ThemeMonitor::GetTheme(const Napi::CallbackInfo& info) {
  bool dark = IsTaskbarDarkTheme();
  return Napi::String::New(info.Env(), dark ? "dark" : "light");
}

void ThemeMonitor::OnThemeChanged(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (themeCallback_) themeCallback_.Release();
  themeCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "ThemeCallback", 0, 1);
}

void ThemeMonitor::StartMonitor() {
  monitorThread_ = std::thread([this]() {
    HKEY hKey;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        0, KEY_NOTIFY, &hKey) != ERROR_SUCCESS) {
      running_ = false;
      return;
    }
    HANDLE hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!hEvent) { RegCloseKey(hKey); running_ = false; return; }

    while (running_) {
      LONG regStatus = RegNotifyChangeKeyValue(hKey, FALSE,
        REG_NOTIFY_CHANGE_LAST_SET, hEvent, TRUE);
      if (regStatus != ERROR_SUCCESS) break;
      if (WaitForSingleObject(hEvent, 1000) == WAIT_OBJECT_0) {
        ResetEvent(hEvent);
        bool isDark = IsTaskbarDarkTheme();
        if (isDark != lastDark_) {
          lastDark_ = isDark;
          if (themeCallback_) {
            themeCallback_.NonBlockingCall([isDark](Napi::Env env, Napi::Function cb) {
              cb.Call({ Napi::Boolean::New(env, isDark) });
            });
          }
        }
      }
    }
    CloseHandle(hEvent);
    RegCloseKey(hKey);
  });
}

void ThemeMonitor::StopMonitor() {
  running_ = false;
  if (monitorThread_.joinable()) monitorThread_.join();
}

void ThemeMonitor::Destroy(const Napi::CallbackInfo& info) {
  StopMonitor();
  if (themeCallback_) { themeCallback_.Release(); themeCallback_ = nullptr; }
}
