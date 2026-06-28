#include <napi.h>
#include "module.h"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  return RegisterAllClasses(env, exports);
}

NODE_API_MODULE(taskbar_widget_helper, Init)
