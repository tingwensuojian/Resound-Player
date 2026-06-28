#include "preview_helper.h"

Napi::FunctionReference* previewHelperConstructor = nullptr;

Napi::Object PreviewHelper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "PreviewHelper", {
    InstanceAccessor("isPreviewVisible", &PreviewHelper::IsPreviewVisible, nullptr),
    InstanceMethod("onPreviewWindowChange", &PreviewHelper::OnPreviewWindowChange),
    InstanceMethod("showPreviewWindow", &PreviewHelper::ShowPreviewWindow),
    InstanceMethod("hidePreviewWindow", &PreviewHelper::HidePreviewWindow),
    InstanceMethod("destroy", &PreviewHelper::Destroy),
  });
  previewHelperConstructor = new Napi::FunctionReference();
  *previewHelperConstructor = Napi::Persistent(func);
  env.SetInstanceData(previewHelperConstructor);
  exports.Set("PreviewHelper", func);
  return exports;
}

PreviewHelper::PreviewHelper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<PreviewHelper>(info) {
  if (info.Length() < 1 || !info[0].IsBuffer()) return;
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr)) return;
  hwndShadow_ = *hwndPtr;
}

PreviewHelper::~PreviewHelper() {
  if (previewCallback_) { previewCallback_.Release(); previewCallback_ = nullptr; }
}

Napi::Value PreviewHelper::IsPreviewVisible(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), isVisible_);
}

void PreviewHelper::OnPreviewWindowChange(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (previewCallback_) previewCallback_.Release();
  previewCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "PreviewCallback", 0, 1);
}

void PreviewHelper::ShowPreviewWindow(const Napi::CallbackInfo& info) {
  isVisible_ = true;
  if (hwndShadow_ && IsWindow(hwndShadow_)) {
    SetWindowPos(hwndShadow_, HWND_TOPMOST, 0, 0, 0, 0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
  }
  if (previewCallback_) {
    previewCallback_.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
      cb.Call({ Napi::Boolean::New(env, true) });
    });
  }
}

void PreviewHelper::HidePreviewWindow(const Napi::CallbackInfo& info) {
  isVisible_ = false;
  if (hwndShadow_ && IsWindow(hwndShadow_)) {
    ShowWindow(hwndShadow_, SW_HIDE);
  }
  if (previewCallback_) {
    previewCallback_.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
      cb.Call({ Napi::Boolean::New(env, false) });
    });
  }
}

void PreviewHelper::Destroy(const Napi::CallbackInfo& info) {
  isVisible_ = false;
  if (previewCallback_) { previewCallback_.Release(); previewCallback_ = nullptr; }
  hwndShadow_ = nullptr;
}
