#include "hover_helper.h"
#include "window_utils.h"

// Match CSS: container padding-left 8px + drag-handler-wrapper 18px + margin-right 2px ? 28px
// Round up to 30 to include full interactive area
const int DRAG_REGION_WIDTH = 30;

Napi::FunctionReference* hoverHelperConstructor = nullptr;

LRESULT CALLBACK HoverHelper::HoverSubclassProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam, UINT_PTR id, DWORD_PTR data) {
  HoverHelper* self = reinterpret_cast<HoverHelper*>(data);
  if (!self) return DefSubclassProc(hwnd, msg, wParam, lParam);

  switch (msg) {
    // WM_NCMOUSEMOVE fires when -webkit-app-region: drag creates HTCAPTION region
    // (non-client mouse events instead of client-area WM_MOUSEMOVE)
    case WM_NCMOUSEMOVE:
    // Track mouse state for IPC-based highlight
    case WM_MOUSEMOVE: {
      TRACKMOUSEEVENT tme = { sizeof(TRACKMOUSEEVENT), TME_LEAVE, hwnd, 0 };
      TrackMouseEvent(&tme);
      self->CheckHoverState(hwnd);
      break;
    }
    case WM_MOUSELEAVE: {
      if (self->isHovering_.exchange(false)) {
        self->isInDragRegion_ = false;
        if (self->hoverCallback_) {
          self->hoverCallback_.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
            cb.Call({ Napi::Boolean::New(env, false) });
          });
        }
        if (self->dragRegionCallback_) {
          self->dragRegionCallback_.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
            cb.Call({ Napi::Boolean::New(env, false) });
          });
        }
      }
      return 0;
    }
  }
  return DefSubclassProc(hwnd, msg, wParam, lParam);
}

void HoverHelper::CheckHoverState(HWND hwnd) {
  POINT pt;
  GetCursorPos(&pt);
  RECT wr;
  GetWindowRect(hwnd, &wr);

  bool hovering = (pt.x >= wr.left && pt.x <= wr.right && pt.y >= wr.top && pt.y <= wr.bottom);
  bool inDragRegion = hovering && (pt.x - wr.left < DRAG_REGION_WIDTH);

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

Napi::Object HoverHelper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "HoverHelper", {
    InstanceAccessor("isHovering", &HoverHelper::IsHovering, nullptr),
    InstanceAccessor("isInDragRegion", &HoverHelper::IsInDragRegion, nullptr),
    InstanceMethod("onHoverChange", &HoverHelper::OnHoverChange),
    InstanceMethod("onDragRegionChange", &HoverHelper::OnDragRegionChange),
    InstanceMethod("destroy", &HoverHelper::Destroy),
  });
  hoverHelperConstructor = new Napi::FunctionReference();
  *hoverHelperConstructor = Napi::Persistent(func);
  env.SetInstanceData(hoverHelperConstructor);
  exports.Set("HoverHelper", func);
  return exports;
}

HoverHelper::HoverHelper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<HoverHelper>(info) {
  if (info.Length() < 1 || !info[0].IsBuffer()) return;
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr)) return;
  hwndTarget_ = *hwndPtr;
  SetWindowSubclass(hwndTarget_, HoverSubclassProc, 2, (DWORD_PTR)this);
}

HoverHelper::~HoverHelper() {
  if (hwndTarget_ && IsWindow(hwndTarget_))
    RemoveWindowSubclass(hwndTarget_, HoverSubclassProc, 2);
  if (hoverCallback_) { hoverCallback_.Release(); hoverCallback_ = nullptr; }
  if (dragRegionCallback_) { dragRegionCallback_.Release(); dragRegionCallback_ = nullptr; }
}

Napi::Value HoverHelper::IsHovering(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), isHovering_);
}

Napi::Value HoverHelper::IsInDragRegion(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), isInDragRegion_);
}

void HoverHelper::OnHoverChange(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (hoverCallback_) hoverCallback_.Release();
  hoverCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "HoverCallback", 0, 1);
}

void HoverHelper::OnDragRegionChange(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (dragRegionCallback_) dragRegionCallback_.Release();
  dragRegionCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "DragRegionCallback", 0, 1);
}

void HoverHelper::Destroy(const Napi::CallbackInfo& info) {
  if (hwndTarget_ && IsWindow(hwndTarget_))
    RemoveWindowSubclass(hwndTarget_, HoverSubclassProc, 2);
  if (hoverCallback_) { hoverCallback_.Release(); hoverCallback_ = nullptr; }
  if (dragRegionCallback_) { dragRegionCallback_.Release(); dragRegionCallback_ = nullptr; }
  hwndTarget_ = nullptr;
}

