pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HostSoftware

ApplicationWindow {
    id: root

    visible: true
    width: 1440
    height: 900
    minimumWidth: 1280
    minimumHeight: 720
    title: "HostSoftware"
    color: theme.windowBackground
    palette {
        window: theme.windowBackground
        windowText: theme.textPrimary
        base: theme.blockBackground
        alternateBase: theme.panelBackground
        text: theme.textPrimary
        button: theme.blockBackground
        buttonText: theme.textPrimary
        highlight: theme.accentGreen
        highlightedText: "#ffffff"
        placeholderText: theme.textMuted
    }

    CParameterStore {
        id: parameterStore
    }

    property string stateMode: "emergencyStop"
    property bool controlClosed: false
    property real simulatedSpeed: 15000
    property real simulatedExhaustTemp: 660
    property real simulatedEcuTemp: 62

    Timer {
        id: simulationTimer
        interval: 250
        repeat: true
        running: true

        onTriggered: {
            const now = Date.now()
            root.simulatedSpeed = Math.max(0, Math.min(70000,
                15000 + 9000 * Math.sin(now / 1000) + Math.random() * 600))
            root.simulatedExhaustTemp = Math.max(0, Math.min(1000,
                620 + 45 * Math.sin(now / 900) + Math.random() * 10))
            root.simulatedEcuTemp = Math.max(0, Math.min(100,
                58 + 8 * Math.sin(now / 2500) + Math.random() * 1.5))
        }
    }

    Row {
        id: mainRow
        anchors.fill: parent
        anchors.margins: 10
        spacing: 8

        Rectangle {
            id: leftPanel
            width: (mainRow.width - mainRow.spacing * 2) / 4
            height: parent.height
            radius: 6
            color: theme.panelBackground
            border.color: theme.outerBorder

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 8
                spacing: 8

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 122
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 6

                            ColumnLayout {
                                Layout.fillWidth: true
                                Layout.preferredWidth: 3
                                spacing: 2

                                Text {
                                    text: "COM口选择"
                                    font.pixelSize: 12
                                    color: theme.textSecondary
                                }

                                CComboBox {
                                    Layout.fillWidth: true
                                    model: ["COM1", "COM2", "COM3", "COM4"]
                                    currentIndex: 0
                                }
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                Layout.preferredWidth: 2
                                spacing: 2

                                Text {
                                    text: "波特率"
                                    font.pixelSize: 12
                                    color: theme.textSecondary
                                }

                                CComboBox {
                                    Layout.fillWidth: true
                                    model: ["9600", "19200", "38400", "115200"]
                                    currentIndex: 0
                                }
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                Layout.preferredWidth: 1
                                spacing: 2

                                Text {
                                    text: "数据位"
                                    font.pixelSize: 12
                                    color: theme.textSecondary
                                }

                                CComboBox {
                                    Layout.fillWidth: true
                                    model: ["8", "7", "6", "5", "2"]
                                    currentIndex: 0
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 92
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8

                        CActionButton {
                            id: closeControlButton
                            visible: root.controlClosed
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            text: "关闭控制"
                            buttonColor: theme.buttonGreen
                            pressedColor: theme.buttonGreenPressed
                            onClicked: root.controlClosed = false
                        }

                        CActionButton {
                            id: speedControlButton
                            visible: !root.controlClosed
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            text: "转速控制"
                            buttonColor: theme.buttonRed
                            pressedColor: theme.buttonRedPressed
                            onClicked: root.controlClosed = true
                        }

                        CActionButton {
                            id: throttleControlButton
                            visible: !root.controlClosed
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            text: "油门控制"
                            buttonColor: theme.buttonRed
                            pressedColor: theme.buttonRedPressed
                            onClicked: root.controlClosed = true
                        }
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8

                        CActionButton {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            text: "启动"
                            font.pixelSize: Math.max(17, Math.min(24, height * 0.32))
                            buttonColor: root.stateMode === "start" ? theme.buttonGreen : theme.stateInactive
                            pressedColor: theme.buttonGreenPressed
                            onClicked: root.stateMode = "start"
                        }

                        CActionButton {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            text: "停车/散热"
                            font.pixelSize: Math.max(17, Math.min(24, height * 0.32))
                            buttonColor: root.stateMode === "parkCool" ? theme.buttonGreen : theme.stateInactive
                            pressedColor: theme.buttonGreenPressed
                            onClicked: root.stateMode = "parkCool"
                        }

                        CActionButton {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            text: "紧急停车"
                            font.pixelSize: Math.max(17, Math.min(24, height * 0.32))
                            buttonColor: root.stateMode === "emergencyStop" ? theme.buttonGreen : theme.stateInactive
                            pressedColor: theme.buttonGreenPressed
                            onClicked: root.stateMode = "emergencyStop"
                        }
                    }
                }
            }
        }

        Rectangle {
            id: centerPanel
            width: (mainRow.width - mainRow.spacing * 2) / 2
            height: parent.height
            radius: 6
            color: theme.panelBackground
            border.color: theme.outerBorder

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 8
                spacing: 8

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 64
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 12
                        spacing: 14

                        Text {
                            text: "引擎状态：故障"
                            font.pixelSize: 16
                            font.bold: true
                            color: theme.errorText
                        }

                        Rectangle {
                            Layout.preferredWidth: 1
                            Layout.preferredHeight: 26
                            color: theme.blockBorder
                        }

                        Text {
                            text: "故障码：001，测试故障"
                            font.pixelSize: 15
                            color: theme.textPrimary
                        }

                        Item {
                            Layout.fillWidth: true
                        }
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumHeight: 300
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 8
                        spacing: 8

                        SpeedGauge {
                            id: speedGauge
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            value: root.simulatedSpeed
                            targetValue: root.simulatedSpeed
                        }

                        Thermometer {
                            id: exhaustThermometer
                            Layout.preferredWidth: 120
                            Layout.fillHeight: true
                            label: "排气温"
                            value: root.simulatedExhaustTemp
                            targetValue: root.simulatedExhaustTemp
                            minValue: 0
                            maxValue: 1000
                            unit: "℃"
                            decimals: 0
                        }

                        Thermometer {
                            id: ecuThermometer
                            Layout.preferredWidth: 120
                            Layout.fillHeight: true
                            label: "ECU温度"
                            value: root.simulatedEcuTemp
                            targetValue: root.simulatedEcuTemp
                            minValue: 0
                            maxValue: 100
                            unit: "℃"
                            decimals: 1
                        }
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumHeight: 180
                    Layout.preferredHeight: 206
                    Layout.maximumHeight: 280
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 6

                        GridLayout {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            columns: 2
                            columnSpacing: 24
                            rowSpacing: 8

                            CParameterRow { parameterStore: parameterStore; parameterIndex: 0 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 1 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 2 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 3 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 4 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 5 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 6 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 7 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 8 }
                            CParameterRow { parameterStore: parameterStore; parameterIndex: 9 }
                        }
                    }
                }
            }
        }

        Rectangle {
            id: rightPanel
            width: (mainRow.width - mainRow.spacing * 2) / 4
            height: parent.height
            radius: 6
            color: theme.panelBackground
            border.color: theme.outerBorder

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 8
                spacing: 8

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 132
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8

                        CActionButton {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            text: "参数设置"
                            buttonColor: theme.buttonTeal
                            pressedColor: theme.buttonTealPressed
                            onClicked: parameterWindow.show()
                        }

                        CActionButton {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            text: "功能测试"
                            buttonColor: theme.buttonNeutral
                            pressedColor: theme.buttonNeutralPressed
                            onClicked: functionTestWindow.show()
                        }
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumHeight: 260
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    ThrottleControl {
                        anchors.fill: parent
                        anchors.margins: 8
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 170
                    radius: 4
                    color: theme.blockBackground
                    border.color: theme.blockBorder

                    AirPressureGauge {
                        anchors.fill: parent
                        anchors.margins: 8
                    }
                }
            }
        }
    }

    Window {
        id: parameterWindow

        visible: false
        modality: Qt.ApplicationModal
        title: "参数设置（请谨慎更改）"
        width: 860
        height: 680
        minimumWidth: 720
        minimumHeight: 620
        color: theme.windowBackground

        onClosing: parameterStore.revertChanges()

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 14
            spacing: 10

            Text {
                text: "参数设置（请谨慎更改）"
                font.pixelSize: 20
                font.bold: true
                color: theme.textPrimary
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                radius: 4
                color: theme.blockBackground
                border.color: theme.blockBorder

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 8
                    spacing: 6

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 10

                        Text {
                            text: "参数名"
                            font.pixelSize: 14
                            font.bold: true
                            color: theme.textSecondary
                            Layout.preferredWidth: 190
                        }

                        Text {
                            text: "当前值"
                            font.pixelSize: 14
                            font.bold: true
                            color: theme.textSecondary
                            Layout.preferredWidth: 120
                        }

                        Text {
                            text: "修改值"
                            font.pixelSize: 14
                            font.bold: true
                            color: theme.textSecondary
                            Layout.fillWidth: true
                        }
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 4

                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 0 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 1 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 2 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 3 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 4 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 5 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 6 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 7 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 8 }
                        CParameterEditRow { parameterStore: parameterStore; parameterIndex: 9 }
                    }
                }
            }

            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 8

                CActionButton {
                    text: "应用"
                    buttonColor: theme.buttonTeal
                    pressedColor: theme.buttonTealPressed
                    enabled: parameterStore.hasChanges
                    onClicked: {
                        confirmOverlay.pendingAction = "apply"
                        confirmOverlay.visible = true
                    }
                }

                CActionButton {
                    text: "完成"
                    buttonColor: theme.buttonNeutral
                    pressedColor: theme.buttonNeutralPressed
                    onClicked: {
                        if (parameterStore.hasChanges) {
                            confirmOverlay.pendingAction = "finish"
                            confirmOverlay.visible = true
                        } else {
                            parameterWindow.close()
                        }
                    }
                }

                CActionButton {
                    text: "取消"
                    buttonColor: theme.buttonGray
                    pressedColor: theme.buttonGrayPressed
                    onClicked: {
                        parameterStore.revertChanges()
                        parameterWindow.close()
                    }
                }
            }
        }

        Rectangle {
            id: confirmOverlay
            anchors.fill: parent
            visible: false
            z: 1000
            color: theme.overlay

            property string pendingAction: "apply"

            Rectangle {
                anchors.centerIn: parent
                width: 340
                height: 170
                radius: 8
                color: theme.blockBackground
                border.color: theme.blockBorder

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 8

                    Text {
                        text: "确认"
                        font.pixelSize: 16
                        font.bold: true
                        color: theme.textPrimary
                    }

                    Text {
                        text: "确认应用当前修改？"
                        font.pixelSize: 14
                        color: theme.buttonNeutral
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        verticalAlignment: Text.AlignVCenter
                    }

                    RowLayout {
                        Layout.alignment: Qt.AlignRight
                        spacing: 8

                        CActionButton {
                            text: "确认"
                            buttonColor: theme.buttonTeal
                            pressedColor: theme.buttonTealPressed
                            onClicked: {
                                parameterStore.applyChanges()
                                confirmOverlay.visible = false
                                if (confirmOverlay.pendingAction === "finish")
                                    parameterWindow.close()
                            }
                        }

                        CActionButton {
                            text: "取消"
                            buttonColor: theme.buttonGray
                            pressedColor: theme.buttonGrayPressed
                            onClicked: confirmOverlay.visible = false
                        }
                    }
                }
            }
        }
    }

    Window {
        id: functionTestWindow

        visible: false
        modality: Qt.ApplicationModal
        title: "功能测试"
        width: 780
        height: 580
        minimumWidth: 680
        minimumHeight: 500
        color: theme.windowBackground

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 14
            spacing: 10

            Text {
                text: "功能测试"
                font.pixelSize: 20
                font.bold: true
                color: theme.textPrimary
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                radius: 4
                color: theme.blockBackground
                border.color: theme.blockBorder

                GridLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    columns: 2
                    columnSpacing: 10
                    rowSpacing: 10

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "测试主油路电磁阀"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "测试热火头"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "燃油清零"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "油泵排除空气"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "测试点火电磁阀"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "测试启动电机"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "推力清零"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "测试油泵(短时)"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "测试油泵(长时)"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }

                    CActionButton {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: "关闭油泵"
                        buttonColor: theme.buttonNeutral
                        pressedColor: theme.buttonNeutralPressed
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true

                Item {
                    Layout.fillWidth: true
                }

                CActionButton {
                    text: "返回"
                    buttonColor: theme.buttonGray
                    pressedColor: theme.buttonGrayPressed
                    onClicked: functionTestWindow.close()
                }
            }
        }
    }
}
