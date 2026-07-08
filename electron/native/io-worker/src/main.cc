#include <napi.h>
#include "thread_safe.h"
#include "file_io.h"

// === N-API 导出函数 ===

Napi::Value ReadFileChunk(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto path = info[0].As<Napi::String>().Utf8Value();
  auto offset = info[1].As<Napi::Number>().Int64Value();
  auto size = info[2].As<Napi::Number>().Uint32Value();
  auto deferred = Napi::Promise::Deferred::New(env);

  ReadFileChunkAsync(path, offset, size,
    [deferred](const char* data, size_t len, int error) {
      if (error) {
        auto msg = Napi::String::New(deferred.Env(),
          "ReadFileChunk failed: " + std::to_string(error));
        deferred.Reject(Napi::Error::New(deferred.Env(), msg).Value());
        return;
      }
      // Synchronous completion, safe to call V8 API directly
      auto buf = Napi::Buffer<char>::New(
        deferred.Env(), len);
      memcpy(buf.Data(), data, len);
      deferred.Resolve(buf);
      delete[] data;
    });

  return deferred.Promise();
}

Napi::Value Stat(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto path = info[0].As<Napi::String>().Utf8Value();
  auto deferred = Napi::Promise::Deferred::New(env);

  StatAsync(path,
    [deferred](const FileStat& stat, int error) {
      if (error) {
        deferred.Reject(Napi::Error::New(deferred.Env(),
          "Stat failed").Value());
        return;
      }
      auto obj = Napi::Object::New(deferred.Env());
      obj.Set("size", Napi::Number::New(deferred.Env(),
        static_cast<double>(stat.size)));
      obj.Set("isFile", Napi::Boolean::New(deferred.Env(),
        stat.isFile));
      obj.Set("exists", Napi::Boolean::New(deferred.Env(),
        stat.exists));
      deferred.Resolve(obj);
    });

  return deferred.Promise();
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
  ShutdownIOWorker();
  return info.Env().Undefined();
}

// === 模块初始化 ===
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  InitializeTSFN(env);
  if (!InitIOWorker()) {
    Napi::Error::Fatal("io-worker", "Failed to initialize I/O worker");
  }
  exports.Set("readFileChunk",
    Napi::Function::New(env, ReadFileChunk));
  exports.Set("stat",
    Napi::Function::New(env, Stat));
  exports.Set("shutdown",
    Napi::Function::New(env, Shutdown));
  return exports;
}

NODE_API_MODULE(io-worker, Init)