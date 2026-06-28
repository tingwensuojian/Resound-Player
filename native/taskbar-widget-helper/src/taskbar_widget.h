#pragma once
#include <napi.h>
#include <windows.h>
#include <shellapi.h>
#include <commctrl.h>
#include <thread>
#include <atomic>
#include <mutex>

struct TaskbarInfo {
  RECT rect;
  UINT edge;
  bool autoHide;
  bool visible;
};

class TaskbarWidget : public Napi::ObjectWrap<TaskbarWidget> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  TaskbarWidget(const Napi::CallbackInfo& info);
  ~TaskbarWidget();

private:
  Napi::Value GetTaskbarInfo(const Napi::CallbackInfo& info);
  Napi::Value FindTaskbar(const Napi::CallbackInfo& info);
  Napi::Value EnsureAboveTaskbar(const Napi::CallbackInfo& info);
  Napi::Value GetTaskbarTheme(const Napi::CallbackInfo& info);
  Napi::Value GetNativeHwnd(const Napi::CallbackInfo& info);
  void SetWidgetPosition(const Napi::CallbackInfo& info);
  void SetWidgetSize(const Napi::CallbackInfo& info);
  void SetAlpha(const Napi::CallbackInfo& info);
  void OnTaskbarThemeChanged(const Napi::CallbackInfo& info);
  void OnTaskbarMoved(const Napi::CallbackInfo& info);
  Napi::Value ProtectExternalWindow(const Napi::CallbackInfo& info);
  Napi::Value KeepExternalWindowTopmost(const Napi::CallbackInfo& info);
  void StopKeepExternalWindowTopmost(const Napi::CallbackInfo& info);
  Napi::Value SetChildWindow(const Napi::CallbackInfo& info);
  Napi::Value PreventHide(const Napi::CallbackInfo& info);
  void Destroy(const Napi::CallbackInfo& info);

  // Subclass proc to prevent hide
  static LRESULT CALLBACK PreventHideSubclassProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam, UINT_PTR subclassId, DWORD_PTR refData);

  HWND CreateWidgetWindow(int x, int y, int width, int height);
  TaskbarInfo QueryTaskbarInfo();
  bool IsDarkTheme();
  void StartTrackerThread();
  void StopTrackerThread();
  void StartThemeMonitor();
  void StopThemeMonitor();

  HWND hwndWidget_ = nullptr;
  HWND hwndTaskbar_ = nullptr;
  int widgetWidth_ = 360;
  int widgetHeight_ = 56;

  std::atomic<bool> running_{false};
  std::thread trackerThread_;
  HWND hwndExternal_ = nullptr;
  std::atomic<bool> keepTopmostRunning_{false};
  std::thread keepTopmostThread_;
  int keepTopmostInterval_ = 16;
  std::thread themeMonitorThread_;

  Napi::ThreadSafeFunction themeCallback_;
  Napi::ThreadSafeFunction movedCallback_;
};
