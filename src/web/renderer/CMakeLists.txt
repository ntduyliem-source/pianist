# SPDX-License-Identifier: GPL-3.0-only
# Reuse the application's already-compiled MuseScore libraries and resources.
# The independent entry point starts no editor, DOM, playback device or QML UI.
option(PIANIST_RENDERER_FAST_LINK "Skip renderer Binaryen passes while iterating" OFF)
add_executable(PianistRenderer EXCLUDE_FROM_ALL main.cpp offscreen.cpp ${APP_RCC_SOURCES})
set_target_properties(PianistRenderer PROPERTIES AUTOMOC ON SUFFIX ".mjs"
    RUNTIME_OUTPUT_DIRECTORY "${PROJECT_SOURCE_DIR}/.tools/web-stage-renderer")
target_compile_definitions(PianistRenderer PRIVATE QT_STATICPLUGIN)
target_include_directories(PianistRenderer PRIVATE "${PROJECT_BINARY_DIR}" "${PROJECT_SOURCE_DIR}"
    "${PROJECT_SOURCE_DIR}/src" "${PROJECT_SOURCE_DIR}/src/framework"
    "${PROJECT_SOURCE_DIR}/src/framework/global")
target_link_libraries(PianistRenderer PRIVATE ${LINK_LIB} Qt6::GuiPrivate Qt6::CorePrivate)
qt_import_plugins(PianistRenderer EXCLUDE_BY_TYPE platforms)
target_link_options(PianistRenderer PRIVATE --bind
    "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sEXPORT_NAME=createPianistRenderer" "-sENVIRONMENT=worker"
    "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=134217728" "-sSTACK_SIZE=5242880"
    "-sNO_EXIT_RUNTIME=1" "-sDISABLE_EXCEPTION_CATCHING=0"
    "-sEXPORTED_RUNTIME_METHODS=ccall,HEAPU8"
    "-sEXPORTED_FUNCTIONS=_main,_malloc,_free,_preparePracticeSnapshot")
if(PIANIST_RENDERER_FAST_LINK)
    target_link_options(PianistRenderer PRIVATE -O0 --profiling-funcs --emit-symbol-map)
else()
    target_link_options(PianistRenderer PRIVATE -Os)
endif()
