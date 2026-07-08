#include "file_io.h"
#include <dispatch/dispatch.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <string>
#include <cstring>
#include <cerrno>

// macOS dispatch_io 实现
// dispatch_io 是内核级异步 I/O，独立于 libuv 线程池
// dispatch_io_create_with_path + dispatch_io_read 实现零拷贝文件读取

struct IOContext {
  dispatch_queue_t queue;
};

static IOContext* ctx = nullptr;

bool InitIOWorker() {
  if (ctx) return true;
  ctx = new IOContext();
  ctx->queue = dispatch_queue_create("io-worker", DISPATCH_QUEUE_CONCURRENT);
  return true;
}

void ShutdownIOWorker() {
  if (!ctx) return;
  dispatch_release(ctx->queue);
  delete ctx;
  ctx = nullptr;
}

void ReadFileChunkAsync(const std::string& path, int64_t offset,
                       uint32_t size, ReadCallback callback) {
  if (!ctx) {
    callback(nullptr, 0, -1);
    return;
  }

  __block dispatch_io_t io = dispatch_io_create_with_path(
    DISPATCH_IO_RANDOM,
    path.c_str(),
    O_RDONLY,
    0,
    ctx->queue,
    ^(int error) {
      if (error && error != ECANCELED) {
        callback(nullptr, 0, error);
      }
    });

  if (!io) {
    callback(nullptr, 0, errno);
    return;
  }

  dispatch_io_set_high_water(io, 256 * 1024);
  dispatch_io_set_low_water(io, 4096);

  dispatch_io_read(io, offset, size, ctx->queue,
    ^(bool done, dispatch_data_t data, int error) {
      if (error) {
        callback(nullptr, 0, error);
        dispatch_io_close(io, 0);
        dispatch_release(io);
        return;
      }
      if (data) {
        size_t dataSize = dispatch_data_get_size(data);
        if (dataSize > 0) {
          const void* buf_ptr = nullptr;
          dispatch_data_t mapped = dispatch_data_create_map(data, &buf_ptr, &dataSize);
          if (mapped) {
            auto buffer = new char[dataSize];
            memcpy(buffer, buf_ptr, dataSize);
            callback(buffer, dataSize, 0);
            dispatch_release(mapped);
          }
        }
      }
      if (done) {
        dispatch_io_close(io, 0);
        dispatch_release(io);
        callback(nullptr, 0, 0);
      }
    });
}

void StatAsync(const std::string& path, StatCallback callback) {
  struct stat st;
  if (stat(path.c_str(), &st) == 0) {
    bool isFile = S_ISREG(st.st_mode) != 0;
    callback({static_cast<int64_t>(st.st_size), isFile, true}, 0);
  } else {
    callback({0, false, false}, errno);
  }
}
