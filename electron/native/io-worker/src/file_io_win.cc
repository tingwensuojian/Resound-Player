#include "file_io.h"
#include <Windows.h>
#include <string>
#include <unordered_map>
#include <mutex>

// Simplified: synchronous I/O in child process, no IOCP needed

struct IOContext {
  std::mutex mutex;
  std::unordered_map<std::wstring, HANDLE> fileCache;
};

static IOContext* ctx = nullptr;

static std::wstring Utf8ToWide(const std::string& utf8) {
  if (utf8.empty()) return L"";
  int len = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
  if (len <= 0) return L"";
  std::wstring result(static_cast<size_t>(len - 1), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, &result[0], len);
  return result;
}

bool InitIOWorker() {
  if (ctx) return true;
  ctx = new IOContext();
  return true;
}

void ShutdownIOWorker() {
  if (!ctx) return;
  for (auto& [path, handle] : ctx->fileCache) {
    CloseHandle(handle);
  }
  ctx->fileCache.clear();
  delete ctx;
  ctx = nullptr;
}

static HANDLE GetFileHandle(const std::wstring& path) {
  std::lock_guard<std::mutex> lock(ctx->mutex);
  auto it = ctx->fileCache.find(path);
  if (it != ctx->fileCache.end()) return it->second;

  HANDLE hFile = CreateFileW(
    path.c_str(),
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    NULL,
    OPEN_EXISTING,
    FILE_FLAG_SEQUENTIAL_SCAN | FILE_FLAG_BACKUP_SEMANTICS,
    NULL);

  if (hFile == INVALID_HANDLE_VALUE) return INVALID_HANDLE_VALUE;
  ctx->fileCache[path] = hFile;
  return hFile;
}

void ReadFileChunkAsync(const std::string& path, int64_t offset,
                       uint32_t size, ReadCallback callback) {
  auto wpath = Utf8ToWide(path);
  HANDLE hFile = GetFileHandle(wpath);
  if (hFile == INVALID_HANDLE_VALUE) {
    callback(nullptr, 0, GetLastError());
    return;
  }

  LARGE_INTEGER liOffset;
  liOffset.QuadPart = offset;
  if (!SetFilePointerEx(hFile, liOffset, NULL, FILE_BEGIN)) {
    callback(nullptr, 0, GetLastError());
    return;
  }

  auto buffer = new char[size];
  DWORD bytesRead = 0;
  if (ReadFile(hFile, buffer, size, &bytesRead, NULL)) {
    callback(buffer, bytesRead, 0);
  } else {
    delete[] buffer;
    callback(nullptr, 0, GetLastError());
  }
}

void StatAsync(const std::string& path, StatCallback callback) {
  auto wpath = Utf8ToWide(path);
  HANDLE hFile = GetFileHandle(wpath);
  if (hFile == INVALID_HANDLE_VALUE) {
    callback({0, false, false}, GetLastError());
    return;
  }

  LARGE_INTEGER fileSize;
  if (!GetFileSizeEx(hFile, &fileSize)) {
    callback({0, false, false}, GetLastError());
    return;
  }

  BY_HANDLE_FILE_INFORMATION info;
  if (GetFileInformationByHandle(hFile, &info)) {
    bool isFile = (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
    callback({fileSize.QuadPart, isFile, true}, 0);
  } else {
    callback({fileSize.QuadPart, true, true}, 0);
  }
}
