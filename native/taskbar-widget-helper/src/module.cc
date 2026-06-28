#include "module.h"
#include "window_utils.h"
#include "tracker.h"
#include "drag_helper.h"
#include "hover_helper.h"
#include "preview_helper.h"
#include "theme_monitor.h"

Napi::Object RegisterAllClasses(Napi::Env env, Napi::Object exports) {
  exports = RegisterWindowUtils(env, exports);
  Tracker::Init(env, exports);
  DragHelper::Init(env, exports);
  HoverHelper::Init(env, exports);
  PreviewHelper::Init(env, exports);
  ThemeMonitor::Init(env, exports);
  return exports;
}
