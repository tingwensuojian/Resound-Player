#pragma once
#include <napi.h>
#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <atomic>

class DragHelper : public Napi::ObjectWrap<DragHelper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  DragHelper(const Napi::CallbackInfo& info);
  ~DragHelper();
private:
  Napi::Value IsDragging(const Napi::CallbackInfo& info);
  void OnDragStart(const Napi::CallbackInfo& info);
  void OnDragMove(const Napi::CallbackInfo& info);
  void OnDragEnd(const Napi::CallbackInfo& info);
  void Destroy(const Napi::CallbackInfo& info);
  
  // SetCapture-based drag (used without -webkit-app-region: drag)
  void BeginTrackDrag(const Napi::CallbackInfo& info);
  void OnTrackDragMove(const Napi::CallbackInfo& info);
  void OnTrackDragEnd(const Napi::CallbackInfo& info);
  
  static LRESULT CALLBACK DragSubclassProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam, UINT_PTR id, DWORD_PTR data);
  HWND hwndTarget_ = nullptr;
  std::atomic<bool> isDragging_{false};
  std::atomic<bool> isTrackDragging_{false};
  int trackOffsetX_ = 0;
  int trackOffsetY_ = 0;
  POINT dragStartPos_{};
  POINT dragWindowPos_{};
  Napi::ThreadSafeFunction dragStartCallback_;
  Napi::ThreadSafeFunction dragMoveCallback_;
  Napi::ThreadSafeFunction dragEndCallback_;
  Napi::ThreadSafeFunction trackDragMoveCallback_;
  Napi::ThreadSafeFunction trackDragEndCallback_;
};
