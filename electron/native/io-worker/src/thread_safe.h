#ifndef THREAD_SAFE_H
#define THREAD_SAFE_H

#include <napi.h>
#include <functional>
#include <queue>
#include <mutex>

// 将任务调度到 Node.js 主线程执行
// 线程安全：可从任意原生线程调用
// 初始化 threadsafe function（在 Init 中调用，有 env 时）
void InitializeTSFN(napi_env env);

// 将任务调度到 Node.js 主线程执行
void CallOnMainThread(std::function<void()> task);

#endif // THREAD_SAFE_H