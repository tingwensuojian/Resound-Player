#include "hover_detector.h"

const int DRAG_REGION = 30;

// ── N-API Init ──

Napi::FunctionReference* hoverDetectorConstructor = nullptr;

Napi::Object HoverDetector::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "HoverDetector", {
    InstanceAccessor("isHovering", &HoverDetector::IsHovering, nullptr),
    InstanceAccessor("isInDragRegion", &HoverDetector::IsInDragRegion, nullptr),
    InstanceMethod("onHoverChange", &HoverDetector::OnHoverChange),
    InstanceMethod("onDragRegionChange", &HoverDetector::OnDragRegionChange),
    InstanceMethod("syncPosition", &HoverDetector::SyncPosition),
    InstanceMethod("destroy", &HoverDetector::Destroy),
  });
  hoverDetectorConstructor = new Napi::FunctionReference();
  *hoverDetectorConstructor = Napi::Persistent(func);
  env.SetInstanceData(hoverDetectorConstructor);
  exports.Set("HoverDetector", func);
  return exports;
}

// ── Constructor ──

HoverDetector::HoverDetector(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<HoverDetector>(info) {
  if (info.Length() < 1 || !info[0].IsBuffer()) return;
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr)) return;

  hwndBrowser_ = *hwndPtr;

  // Background polling thread: GetCursorPos + GetWindowRect every 16ms
  // No window creation → no click interception ✅
  // No WebView dependency → works on all Electron versions ✅
  StartMsgPumpThread();
}

// ── Destructor ──

HoverDetector::~HoverDetector() {
  StopMsgPumpThread();
  if (hoverCallback_) { hoverCallback_.Release(); hoverCallback_ = nullptr; }
  if (dragRegionCallback_) { dragRegionCallback_.Release(); dragRegionCallback_ = nullptr; }
}

// ── Thread Management ──

void HoverDetector::StartMsgPumpThread() {
  if (pumpRunning_) return;
  pumpRunning_ = true;
  pumpThread_ = std::thread([this]() { MsgPumpLoop(); });
}

void HoverDetector::StopMsgPumpThread() {
  pumpRunning_ = false;
  if (pumpThread_.joinable()) pumpThread_.join();
}

void HoverDetector::MsgPumpLoop() {
  // Brief delay to allow JS-side onHoverChange/onDragRegionChange to register
  Sleep(150);
  
  while (pumpRunning_) {
    if (hwndBrowser_ && IsWindow(hwndBrowser_)) {
      POINT pt;
      GetCursorPos(&pt);
      RECT wr;
      GetWindowRect(hwndBrowser_, &wr);

      int clientX = pt.x - wr.left;
      int clientY = pt.y - wr.top;
      int w = wr.right - wr.left;
      int h = wr.bottom - wr.top;

      bool hovering = (clientX >= 0 && clientX <= w &&
                       clientY >= 0 && clientY <= h);
      bool inDragRegion = hovering && (clientX < DRAG_REGION);
      SetHoverState(hovering, inDragRegion);
    }
    Sleep(16); // ~60fps
  }
}

// ── Hover State ──

void HoverDetector::SetHoverState(bool hovering, bool inDragRegion) {
  if (hovering != isHovering_) {
    isHovering_ = hovering;
    if (hoverCallback_) {
      hoverCallback_.NonBlockingCall([hovering](Napi::Env env, Napi::Function cb) {
        cb.Call({ Napi::Boolean::New(env, hovering) });
      });
    }
  }
  if (inDragRegion != isInDragRegion_) {
    isInDragRegion_ = inDragRegion;
    if (dragRegionCallback_) {
      dragRegionCallback_.NonBlockingCall([inDragRegion](Napi::Env env, Napi::Function cb) {
        cb.Call({ Napi::Boolean::New(env, inDragRegion) });
      });
    }
  }
}

// ── Sync Position (no-op with polling approach, kept for JS API compat) ──

void HoverDetector::SyncPosition(const Napi::CallbackInfo& info) {
  // Not needed — polling thread reads GetWindowRect every frame
}

// ── JS Accessors ──

Napi::Value HoverDetector::IsHovering(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), isHovering_);
}

Napi::Value HoverDetector::IsInDragRegion(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), isInDragRegion_);
}

void HoverDetector::OnHoverChange(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (hoverCallback_) hoverCallback_.Release();
  hoverCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "HoverCallback", 0, 1);
}

void HoverDetector::OnDragRegionChange(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (dragRegionCallback_) dragRegionCallback_.Release();
  dragRegionCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "DragRegionCallback", 0, 1);
}

void HoverDetector::Destroy(const Napi::CallbackInfo& info) {
  StopMsgPumpThread();
  if (hoverCallback_) { hoverCallback_.Release(); hoverCallback_ = nullptr; }
  if (dragRegionCallback_) { dragRegionCallback_.Release(); dragRegionCallback_ = nullptr; }
}