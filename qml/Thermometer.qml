pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property string label: ""
    property real value: 0
    property real targetValue: 0
    property real minValue: 0
    property real maxValue: 100
    property string unit: ""
    property int decimals: 0
    property real fraction: Math.max(0, Math.min(1,
        (root.value - root.minValue) / (root.maxValue - root.minValue)))

    implicitWidth: 130
    implicitHeight: 300

    Behavior on value {
        NumberAnimation {
            duration: 900
            easing.type: Easing.InOutSine
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: 8
        color: theme.blockBackground
        border.color: theme.blockBorder
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 8
        spacing: 4

        Text {
            text: root.label
            font.pixelSize: 13
            font.bold: true
            color: theme.textPrimary
            Layout.alignment: Qt.AlignHCenter
        }

        Rectangle {
            id: tube
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: 180
            radius: 8
            color: theme.gaugeBackground
            border.color: theme.blockBorder

            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 8
                width: parent.width * 0.42
                height: (parent.height - 16) * root.fraction
                radius: 4
                color: root.fraction > 0.8 ? theme.accentRed : theme.accentAmber
            }

            Repeater {
                model: 10

                Rectangle {
                    required property int index

                    x: 6
                    y: tube.height - 8 - (tube.height - 16) * (index / 9)
                    width: 8
                    height: 1
                    color: theme.gaugeTickMinor
                }
            }
        }

        Text {
            text: Number(root.targetValue).toFixed(root.decimals)
                  + (root.unit.length > 0 ? " " + root.unit : "")
            font.family: "Arial"
            font.pixelSize: Math.max(14, Math.min(26, root.height * 0.07))
            font.bold: true
            color: theme.lcdText
            Layout.alignment: Qt.AlignHCenter
        }
    }
}
