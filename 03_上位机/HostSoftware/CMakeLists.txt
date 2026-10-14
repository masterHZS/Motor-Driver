cmake_minimum_required(VERSION 3.21)

project(HostSoftware VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.8 REQUIRED COMPONENTS Core Quick SerialPort)
qt_standard_project_setup()
qt_policy(SET QTP0001 NEW)
qt_policy(SET QTP0004 NEW)

qt_add_executable(HostSoftware WIN32
    src/main.cpp
    src/CCommManager.cpp
    src/CParameterStore.cpp
    src/CTheme.cpp
)

qt_add_qml_module(HostSoftware
    URI HostSoftware
    VERSION 1.0
    NO_CACHEGEN
    QML_FILES
        qml/Main.qml
        qml/CActionButton.qml
        qml/SpeedGauge.qml
        qml/Thermometer.qml
        qml/ThrottleControl.qml
        qml/AirPressureGauge.qml
        qml/CParameterRow.qml
        qml/CParameterEditRow.qml
        qml/CComboBox.qml
)

target_link_libraries(HostSoftware PRIVATE Qt6::Core Qt6::Quick Qt6::SerialPort)

option(HOST_BUILD_TESTS "构建不连接设备的上位机控制回归" OFF)
if(HOST_BUILD_TESTS)
    add_executable(HostControlTests tests/test_control.cpp src/CCommManager.h)
    target_include_directories(HostControlTests PRIVATE src)
    target_link_libraries(HostControlTests PRIVATE Qt6::Core Qt6::SerialPort)
    # Release也必须执行断言，不能因NDEBUG而跳过验证。
    if(MSVC)
        target_compile_options(HostControlTests PRIVATE /UNDEBUG)
    else()
        target_compile_options(HostControlTests PRIVATE -UNDEBUG)
    endif()
endif()

find_program(WINDEPLOYQT_EXECUTABLE windeployqt
    HINTS "${Qt6_DIR}/../../.."
    PATH_SUFFIXES bin
    REQUIRED
)

add_custom_command(TARGET HostSoftware POST_BUILD
    COMMAND "${WINDEPLOYQT_EXECUTABLE}"
        --no-translations
        --qmldir "${CMAKE_CURRENT_SOURCE_DIR}/qml"
        "$<TARGET_FILE:HostSoftware>"
    COMMENT "Deploying Qt runtime files"
)
