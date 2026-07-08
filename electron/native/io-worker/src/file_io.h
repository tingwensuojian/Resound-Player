#ifndef FILE_IO_H
#define FILE_IO_H

#include <cstdint>
#include <functional>
#include <string>

// 读取完成回调: (const char* data, size_t len, int error)
// data == nullptr && len == 0 表示传输完毕
// error != 0 表示出错
using ReadCallback = std::function<void(const char*, size_t, int)>;

// stat 结果
struct FileStat {
  int64_t size;
  bool isFile;
  bool exists;
};

// stat 回调: (const FileStat& stat, int error)
using StatCallback = std::function<void(const FileStat&, int)>;

// === 构造函数 / 析构 ===
bool InitIOWorker();
void ShutdownIOWorker();

// === 异步接口 ===
void ReadFileChunkAsync(const std::string& path, int64_t offset,
                       uint32_t size, ReadCallback callback);
void StatAsync(const std::string& path, StatCallback callback);

#endif // FILE_IO_H