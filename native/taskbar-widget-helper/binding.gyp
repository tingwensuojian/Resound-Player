{
  "targets": [
    {
      "target_name": "taskbar_widget_helper",
      "sources": [
        "src/addon.cc",
        "src/module.cc",
        "src/window_utils.cc",
        "src/tracker.cc",
        "src/drag_helper.cc",
        "src/hover_helper.cc",
        "src/hover_detector.cc",
        "src/preview_helper.cc",
        "src/theme_monitor.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NAPI_VERSION=8",
        "UNICODE",
        "_UNICODE"
      ],
      "conditions": [
        [
          "OS=='win'",
          {
            "libraries": [
              "-lole32.lib",
              "-loleaut32.lib",
              "-luser32.lib",
              "-lgdi32.lib",
              "-lshlwapi.lib",
              "-lcomctl32.lib"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17", "/utf-8"]
              }
            }
          }
        ]
      ]
    }
  ]
}
