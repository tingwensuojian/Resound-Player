#include "drag_helper.h"

Napi::FunctionReference* dragHelperConstructor = nullptr;

LRESULT CALLBACK DragHelper::DragSubclassProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam, UINT_PTR id, DWORD_PTR data) {
  DragHelper* self = reinterpret_cast<DragHelper*>(data);
  if (!self) return DefSubclassProc(hwnd, msg, wParam, lParam);

  switch (msg) {
    // Intercept WM_NCLBUTTONDOWN with HTCAPTION (from -webkit-app-region: drag)
    // Remove taskbar parent BEFORE SC_MOVE starts so coordinates are screen-relative
    case WM_NCLBUTTONDOWN: {
      if (wParam == HTCAPTION) {
        HWND taskbar = FindWindowW(L"Shell_TrayWnd", nullptr);
        if (taskbar && IsWindow(hwnd) && GetWindowLongPtrW(hwnd, GWLP_HWNDPARENT) == (LONG_PTR)taskbar) {
          SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, 0);
        }
      }
      break;  // Fall through to DefSubclassProc which processes HTCAPTION -> SC_MOVE
    }
    // Native drag via SC_MOVE (from -webkit-app-region: drag)
    case WM_ENTERSIZEMOVE: {
      self->isDragging_ = true;
      // Backup: remove taskbar parent if still attached
      HWND taskbar = FindWindowW(L"Shell_TrayWnd", nullptr);
      if (taskbar && IsWindow(hwnd) && GetWindowLongPtrW(hwnd, GWLP_HWNDPARENT) == (LONG_PTR)taskbar) {
        SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, 0);
      }
      if (self->dragStartCallback_) {
        self->dragStartCallback_.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
          cb.Call({});
        });
      }
      break;
    }
    case WM_MOVING: {
      if (self->isDragging_) {
        RECT* pRect = (RECT*)lParam;
          RECT r = *pRect;
        if (self->dragMoveCallback_) {
          self->dragMoveCallback_.NonBlockingCall([r](Napi::Env env, Napi::Function cb) {
            cb.Call({ Napi::Number::New(env, r.left), Napi::Number::New(env, r.top) });
          });
        }
      }
      break;
    }
    case WM_EXITSIZEMOVE: {
      if (self->isDragging_) {
        self->isDragging_ = false;
        RECT wr;
        GetWindowRect(hwnd, &wr);
        if (self->dragEndCallback_) {
          self->dragEndCallback_.NonBlockingCall([wr](Napi::Env env, Napi::Function cb) {
            cb.Call({ Napi::Number::New(env, wr.left), Napi::Number::New(env, wr.top) });
          });
        }
      }
      break;
    }

    // SetCapture-based drag (legacy)
    case WM_MOUSEMOVE: {
      if (self->isTrackDragging_) {
        POINT pt;
        GetCursorPos(&pt);
        int newX = pt.x - self->trackOffsetX_;
        int newY = pt.y - self->trackOffsetY_;
        SetWindowPos(hwnd, NULL, newX, newY, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
        if (self->trackDragMoveCallback_) {
          self->trackDragMoveCallback_.NonBlockingCall([newX, newY](Napi::Env env, Napi::Function cb) {
            cb.Call({ Napi::Number::New(env, newX), Napi::Number::New(env, newY) });
          });
        }
      }
      break;
    }
    case WM_LBUTTONUP: {
      if (self->isTrackDragging_) {
        self->isTrackDragging_ = false;
        ReleaseCapture();
        RECT wr;
        GetWindowRect(hwnd, &wr);
        if (self->trackDragEndCallback_) {
          self->trackDragEndCallback_.NonBlockingCall([wr](Napi::Env env, Napi::Function cb) {
            cb.Call({ Napi::Number::New(env, wr.left), Napi::Number::New(env, wr.top) });
          });
        }
      }
      break;
    }
  }
  return DefSubclassProc(hwnd, msg, wParam, lParam);
}

Napi::Object DragHelper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "DragHelper", {
    InstanceAccessor("isDragging", &DragHelper::IsDragging, nullptr),
    InstanceMethod("onDragStart", &DragHelper::OnDragStart),
    InstanceMethod("onDragMove", &DragHelper::OnDragMove),
    InstanceMethod("onDragEnd", &DragHelper::OnDragEnd),
    InstanceMethod("beginTrackDrag", &DragHelper::BeginTrackDrag),
    InstanceMethod("onTrackDragMove", &DragHelper::OnTrackDragMove),
    InstanceMethod("onTrackDragEnd", &DragHelper::OnTrackDragEnd),
    InstanceMethod("destroy", &DragHelper::Destroy),
  });
  dragHelperConstructor = new Napi::FunctionReference();
  *dragHelperConstructor = Napi::Persistent(func);
  env.SetInstanceData(dragHelperConstructor);
  exports.Set("DragHelper", func);
  return exports;
}

DragHelper::DragHelper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<DragHelper>(info) {
  if (info.Length() < 1 || !info[0].IsBuffer()) return;
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr)) return;
  hwndTarget_ = *hwndPtr;
  SetWindowSubclass(hwndTarget_, DragSubclassProc, 1, (DWORD_PTR)this);
}

DragHelper::~DragHelper() {
  if (hwndTarget_ && IsWindow(hwndTarget_))
    RemoveWindowSubclass(hwndTarget_, DragSubclassProc, 1);
  if (dragStartCallback_) { dragStartCallback_.Release(); dragStartCallback_ = nullptr; }
  if (dragMoveCallback_) { dragMoveCallback_.Release(); dragMoveCallback_ = nullptr; }
  if (dragEndCallback_) { dragEndCallback_.Release(); dragEndCallback_ = nullptr; }
  if (trackDragMoveCallback_) { trackDragMoveCallback_.Release(); trackDragMoveCallback_ = nullptr; }
  if (trackDragEndCallback_) { trackDragEndCallback_.Release(); trackDragEndCallback_ = nullptr; }
}

Napi::Value DragHelper::IsDragging(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), isDragging_ || isTrackDragging_);
}

void DragHelper::OnDragStart(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (dragStartCallback_) dragStartCallback_.Release();
  dragStartCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "DragStart", 0, 1);
}

void DragHelper::OnDragMove(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (dragMoveCallback_) dragMoveCallback_.Release();
  dragMoveCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "DragMove", 0, 1);
}

void DragHelper::OnDragEnd(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (dragEndCallback_) dragEndCallback_.Release();
  dragEndCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "DragEnd", 0, 1);
}

void DragHelper::BeginTrackDrag(const Napi::CallbackInfo& info) {
  if (info.Length() < 3) return;
  HWND* hwndPtr = info[0].As<Napi::Buffer<HWND>>().Data();
  if (!hwndPtr || !IsWindow(*hwndPtr)) return;
  int offsetX = info[1].As<Napi::Number>().Int32Value();
  int offsetY = info[2].As<Napi::Number>().Int32Value();
  hwndTarget_ = *hwndPtr;
  trackOffsetX_ = offsetX;
  trackOffsetY_ = offsetY;
  isTrackDragging_ = true;
  SetCapture(hwndTarget_);
}

void DragHelper::OnTrackDragMove(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (trackDragMoveCallback_) trackDragMoveCallback_.Release();
  trackDragMoveCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "TrackDragMove", 0, 1);
}

void DragHelper::OnTrackDragEnd(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (trackDragEndCallback_) trackDragEndCallback_.Release();
  trackDragEndCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(), "TrackDragEnd", 0, 1);
}

void DragHelper::Destroy(const Napi::CallbackInfo& info) {
  isDragging_ = false;
  isTrackDragging_ = false;
  if (hwndTarget_ && IsWindow(hwndTarget_)) {
    RemoveWindowSubclass(hwndTarget_, DragSubclassProc, 1);
    ReleaseCapture();
  }
  if (dragStartCallback_) { dragStartCallback_.Release(); dragStartCallback_ = nullptr; }
  if (dragMoveCallback_) { dragMoveCallback_.Release(); dragMoveCallback_ = nullptr; }
  if (dragEndCallback_) { dragEndCallback_.Release(); dragEndCallback_ = nullptr; }
  if (trackDragMoveCallback_) { trackDragMoveCallback_.Release(); trackDragMoveCallback_ = nullptr; }
  if (trackDragEndCallback_) { trackDragEndCallback_.Release(); trackDragEndCallback_ = nullptr; }
  hwndTarget_ = nullptr;
}

