#pragma once
#include <napi.h>
#include <windows.h>
#include <atomic>
#include <thread>

class ThemeMonitor : public Napi::ObjectWrap<ThemeMonitor> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  ThemeMonitor(const Napi::CallbackInfo& info);
  ~ThemeMonitor();
private:
  Napi::Value GetTheme(const Napi::CallbackInfo& info);
  void OnThemeChanged(const Napi::CallbackInfo& info);
  void Destroy(const Napi::CallbackInfo& info);
  void StartMonitor();
  void StopMonitor();
  std::atomic<bool> running_{false};
  std::thread monitorThread_;
  bool lastDark_ = false;
  Napi::ThreadSafeFunction themeCallback_;
};
