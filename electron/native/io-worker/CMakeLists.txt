cmake_minimum_required(VERSION 3.15)
project(io-worker)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(${CMAKE_JS_INC})
include_directories(${CMAKE_SOURCE_DIR}/../../../node_modules/node-addon-api)

if(WIN32)
  set(PLATFORM_SOURCES src/file_io_win.cc)
elseif(APPLE)
  set(PLATFORM_SOURCES src/file_io_mac.cc)
  set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -framework System")
endif()

add_library(io-worker SHARED
  src/main.cc
  src/thread_safe.cc
  ${PLATFORM_SOURCES}
)

set_target_properties(io-worker PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

target_link_libraries(io-worker ${CMAKE_JS_LIB})
