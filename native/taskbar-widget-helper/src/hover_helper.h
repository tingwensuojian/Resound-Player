#pragma once
#include <napi.h>
#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <atomic>

class HoverHelper : public Napi::ObjectWrap<HoverHelper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  HoverHelper(const Napi::CallbackInfo& info);
  ~HoverHelper();
private:
  Napi::Value IsHovering(const Napi::CallbackInfo& info);
  Napi::Value IsInDragRegion(const Napi::CallbackInfo& info);
  void OnHoverChange(const Napi::CallbackInfo& info);
  void OnDragRegionChange(const Napi::CallbackInfo& info);
  void Destroy(const Napi::CallbackInfo& info);
  static LRESULT CALLBACK HoverSubclassProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam, UINT_PTR id, DWORD_PTR data);
  void CheckHoverState(HWND hwnd);
  HWND hwndTarget_ = nullptr;
  std::atomic<bool> isHovering_{false};
  std::atomic<bool> isInDragRegion_{false};
  Napi::ThreadSafeFunction hoverCallback_;
  Napi::ThreadSafeFunction dragRegionCallback_;
};
