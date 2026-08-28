import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property real pressure: 100.0

    implicitWidth: 240
    implicitHeight: 140

    Rectangle {
        anchors.fill: parent
        radius: 8
        color: theme.blockBackground
        border.color: theme.blockBorder
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 6

        Text {
            text: "气压（kPa）"
            font.pixelSize: 14
            font.bold: true
            color: theme.textPrimary
            Layout.alignment: Qt.AlignHCenter
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: Math.max(40, root.height * 0.42)
            radius: 4
            color: theme.lcdBackground
            border.color: theme.lcdBorder
            border.width: 1

            Text {
                anchors.centerIn: parent
                text: Number(root.pressure).toFixed(1) + " kPa"
                color: theme.lcdText
                font.family: "Arial"
                font.pixelSize: Math.max(14, Math.min(32, parent.height * 0.45))
                font.bold: true
            }
        }
    }
}
