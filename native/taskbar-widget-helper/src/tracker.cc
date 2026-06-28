#include "tracker.h"
#include "window_utils.h"
#include <shellapi.h>
#include <set>

struct EnumData {
  std::vector<RECT> tasklistRects;
  std::vector<RECT> trayRects;
  RECT taskbarRect;
  bool bottomTaskbar;
};

BOOL CALLBACK Tracker::EnumChildProc(HWND hwnd, LPARAM lParam) {
  EnumData* data = reinterpret_cast<EnumData*>(lParam);
  if (!data) return FALSE;
  wchar_t className[256];
  if (!GetClassNameW(hwnd, className, 256)) return TRUE;
  RECT r;
  if (!GetWindowRect(hwnd, &r)) return TRUE;
  if (wcscmp(className, L"MSTaskListWClass") == 0) {
    data->tasklistRects.push_back(r);
  } else if (wcscmp(className, L"MSTaskSwWClass") == 0) {
    data->tasklistRects.push_back(r);
  } else if (wcscmp(className, L"TrayNotifyWnd") == 0) {
    data->trayRects.push_back(r);
  }
  return TRUE;
}

Napi::FunctionReference* trackerConstructor = nullptr;

Napi::Object Tracker::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "Tracker", {
    InstanceMethod("findBlanks", &Tracker::FindBlanks),
    InstanceMethod("getTaskbarInfo", &Tracker::GetTaskbarInfo),
    InstanceMethod("onTaskbarLayoutChanged", &Tracker::OnTaskbarLayoutChanged),
    InstanceMethod("destroy", &Tracker::Destroy),
  });
  trackerConstructor = new Napi::FunctionReference();
  *trackerConstructor = Napi::Persistent(func);
  env.SetInstanceData(trackerConstructor);
  exports.Set("Tracker", func);
  return exports;
}

Tracker::Tracker(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Tracker>(info) {
  hwndTaskbar_ = FindShellTaskbar();
}

Tracker::~Tracker() {
  if (layoutCallback_) {
    layoutCallback_.Release();
    layoutCallback_ = nullptr;
  }
}

Napi::Value Tracker::FindBlanks(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!hwndTaskbar_ || !IsWindow(hwndTaskbar_))
    hwndTaskbar_ = FindShellTaskbar();
  if (!hwndTaskbar_)
    return env.Null();

  TaskbarInfo tbInfo = QueryTaskbarInfo(hwndTaskbar_);
  EnumData data;
  data.taskbarRect = tbInfo.rect;
  RECT tb = tbInfo.rect;
  data.bottomTaskbar = (tbInfo.edge == ABE_BOTTOM);

  EnumChildWindows(hwndTaskbar_, EnumChildProc, (LPARAM)&data);

  // Calculate gap between tasklist (rightmost) and tray (leftmost)
  RECT taskbarRect = tbInfo.rect;
  int tasklistRight = taskbarRect.left;
  for (auto& r : data.tasklistRects) {
    if (r.right > tasklistRight) tasklistRight = r.right;
  }
  int trayLeft = taskbarRect.right;
  for (auto& r : data.trayRects) {
    if (r.left < trayLeft) trayLeft = r.left;
  }

  // Build result
  Napi::Object result = Napi::Object::New(env);

  Napi::Object tbObj = Napi::Object::New(env);
  tbObj.Set("left", Napi::Number::New(env, tb.left));
  tbObj.Set("top", Napi::Number::New(env, tb.top));
  tbObj.Set("right", Napi::Number::New(env, tb.right));
  tbObj.Set("bottom", Napi::Number::New(env, tb.bottom));
  tbObj.Set("edge", Napi::Number::New(env, tbInfo.edge));
  tbObj.Set("autoHide", Napi::Boolean::New(env, tbInfo.autoHide));
  result.Set("taskbar", tbObj);
  result.Set("left", Napi::Number::New(env, tasklistRight));
  result.Set("right", Napi::Number::New(env, trayLeft));

  // Create candidates array
  int gapWidth = trayLeft - tasklistRight;
  Napi::Array candidates = Napi::Array::New(env);
  if (gapWidth > 100) {
    Napi::Object gap = Napi::Object::New(env);
    gap.Set("x", Napi::Number::New(env, tasklistRight));
    gap.Set("y", Napi::Number::New(env, tb.top));
    gap.Set("width", Napi::Number::New(env, gapWidth));
    gap.Set("height", Napi::Number::New(env, tb.bottom - tb.top));
    candidates.Set((uint32_t)0, gap);
  }
  result.Set("candidates", candidates);
  return result;
}

Napi::Value Tracker::GetTaskbarInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!hwndTaskbar_ || !IsWindow(hwndTaskbar_))
    hwndTaskbar_ = FindShellTaskbar();
  if (!hwndTaskbar_) return env.Null();
  TaskbarInfo tb = QueryTaskbarInfo(hwndTaskbar_);
  Napi::Object result = Napi::Object::New(env);
  Napi::Object rect = Napi::Object::New(env);
  rect.Set("left", Napi::Number::New(env, tb.rect.left));
  rect.Set("top", Napi::Number::New(env, tb.rect.top));
  rect.Set("right", Napi::Number::New(env, tb.rect.right));
  rect.Set("bottom", Napi::Number::New(env, tb.rect.bottom));
  result.Set("rect", rect);
  result.Set("edge", Napi::Number::New(env, tb.edge));
  result.Set("autoHide", Napi::Boolean::New(env, tb.autoHide));
  result.Set("visible", Napi::Boolean::New(env, tb.visible));
  return result;
}

void Tracker::OnTaskbarLayoutChanged(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsFunction()) return;
  if (layoutCallback_) layoutCallback_.Release();
  layoutCallback_ = Napi::ThreadSafeFunction::New(
    info.Env(), info[0].As<Napi::Function>(),
    "LayoutCallback", 0, 1);
}

void Tracker::Destroy(const Napi::CallbackInfo& info) {
  if (layoutCallback_) {
    layoutCallback_.Release();
    layoutCallback_ = nullptr;
  }
}
