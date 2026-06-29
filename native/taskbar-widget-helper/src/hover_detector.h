#pragma once
#include <napi.h>
#include <windows.h>
#include <commctrl.h>
#include <windowsx.h>
#include <atomic>
#include <thread>

class HoverDetector : public Napi::ObjectWrap<HoverDetector> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  HoverDetector(const Napi::CallbackInfo& info);
  ~HoverDetector();

private:
  // JS-accessible API
  Napi::Value IsHovering(const Napi::CallbackInfo& info);
  Napi::Value IsInDragRegion(const Napi::CallbackInfo& info);
  void OnHoverChange(const Napi::CallbackInfo& info);
  void OnDragRegionChange(const Napi::CallbackInfo& info);
  void SyncPosition(const Napi::CallbackInfo& info);
  void Destroy(const Napi::CallbackInfo& info);

  void StartMsgPumpThread();
  void StopMsgPumpThread();
  void MsgPumpLoop();
  void SetHoverState(bool hovering, bool inDragRegion);

  // Constants
  static const int DRAG_REGION_WIDTH = 30;

  // Window handle
  HWND hwndBrowser_ = nullptr;

  // State
  std::atomic<bool> isHovering_{false};
  std::atomic<bool> isInDragRegion_{false};
  std::atomic<bool> pumpRunning_{false};
  std::thread pumpThread_;

  // ThreadSafe callbacks
  Napi::ThreadSafeFunction hoverCallback_;
  Napi::ThreadSafeFunction dragRegionCallback_;
};
