#pragma once
#include <napi.h>
#include <windows.h>
#include <vector>
#include <atomic>
#include <thread>

class Tracker : public Napi::ObjectWrap<Tracker> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  Tracker(const Napi::CallbackInfo& info);
  ~Tracker();
private:
  Napi::Value FindBlanks(const Napi::CallbackInfo& info);
  Napi::Value GetTaskbarInfo(const Napi::CallbackInfo& info);
  void OnTaskbarLayoutChanged(const Napi::CallbackInfo& info);
  void Destroy(const Napi::CallbackInfo& info);
  static BOOL CALLBACK EnumChildProc(HWND hwnd, LPARAM lParam);
  HWND hwndTaskbar_ = nullptr;
  Napi::ThreadSafeFunction layoutCallback_;
};
