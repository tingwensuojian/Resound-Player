#pragma once
#include <napi.h>
#include <windows.h>
#include <atomic>

class PreviewHelper : public Napi::ObjectWrap<PreviewHelper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  PreviewHelper(const Napi::CallbackInfo& info);
  ~PreviewHelper();
private:
  Napi::Value IsPreviewVisible(const Napi::CallbackInfo& info);
  void OnPreviewWindowChange(const Napi::CallbackInfo& info);
  void ShowPreviewWindow(const Napi::CallbackInfo& info);
  void HidePreviewWindow(const Napi::CallbackInfo& info);
  void Destroy(const Napi::CallbackInfo& info);
  HWND hwndShadow_ = nullptr;
  std::atomic<bool> isVisible_{false};
  Napi::ThreadSafeFunction previewCallback_;
};
