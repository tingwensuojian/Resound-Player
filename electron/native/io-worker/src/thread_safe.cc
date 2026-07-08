#include "thread_safe.h"

static napi_threadsafe_function g_tsfn = nullptr;

static void CallJS(napi_env env, napi_value js_cb,
    void* context, void* data) {
  auto task = static_cast<std::function<void()>*>(data);
  (*task)();
  delete task;
}

void InitializeTSFN(napi_env env) {
  if (!g_tsfn) {
    napi_create_threadsafe_function(
      env, nullptr, nullptr,
      Napi::String::New(env, "io-worker-tsfn"),
      0, 1, nullptr, nullptr, nullptr,
      CallJS, &g_tsfn);
  }
}

void CallOnMainThread(std::function<void()> task) {
  if (!g_tsfn) return;
  auto p = new std::function<void()>(std::move(task));
  napi_call_threadsafe_function(g_tsfn, p, napi_tsfn_blocking);
}
