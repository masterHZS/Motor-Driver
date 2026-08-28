import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property real throttlePercent: 0.0
    property real baseLeverWidth: 120
    property real leverWidth: root.baseLeverWidth * 1.25
    property real trackWidth: root.leverWidth * 0.8
    property real lcdWidth: root.leverWidth * 1.2

    implicitWidth: 240
    implicitHeight: 300

    Rectangle {
        anchors.fill: parent
        radius: 8
        color: theme.blockBackground
        border.color: theme.blockBorder
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 8
        spacing: 6

        Text {
            text: "油门推杆"
            font.pixelSize: 14
            font.bold: true
            color: theme.textPrimary
            Layout.alignment: Qt.AlignHCenter
        }

        Rectangle {
            id: trackArea
            Layout.fillWidth: false
            Layout.preferredWidth: root.trackWidth
            Layout.maximumWidth: root.trackWidth
            Layout.fillHeight: true
            Layout.alignment: Qt.AlignHCenter
            radius: 6
            color: theme.trackBackground

            Rectangle {
                id: progressBar
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                height: parent.height * root.throttlePercent
                color: theme.accentGreen
            }

            Rectangle {
                id: knob
                width: root.leverWidth
                height: 46
                anchors.horizontalCenter: parent.horizontalCenter
                y: (trackArea.height - knob.height) * (1 - root.throttlePercent)
                radius: 6
                color: theme.accentAmber
                border.color: Qt.darker(theme.accentAmber, 1.2)
                border.width: 2

                Text {
                    anchors.centerIn: parent
                    text: "油门：" + Math.round(root.throttlePercent * 100) + "%"
                    color: "#ffffff"
                    font.pixelSize: 13
                    font.bold: true
                }
            }

            MouseArea {
                id: dragArea
                anchors.fill: parent
                onPressed: root.setThrottleFromMouse(mouseY)
                onPositionChanged: if (pressed) root.setThrottleFromMouse(mouseY)
            }
        }

        Rectangle {
            Layout.fillWidth: false
            Layout.preferredWidth: root.lcdWidth
            Layout.maximumWidth: root.lcdWidth
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredHeight: Math.max(32, root.height * 0.14)
            radius: 4
            color: theme.lcdBackground
            border.color: theme.lcdBorder
            border.width: 1

            Text {
                anchors.centerIn: parent
                text: "油门：" + Math.round(root.throttlePercent * 100) + "%"
                color: theme.lcdText
                font.family: "Arial"
                font.pixelSize: Math.max(12, Math.min(26, parent.height * 0.5))
                font.bold: true
            }
        }
    }

    function setThrottleFromMouse(mouseY)
    {
        const maxY = trackArea.height - knob.height
        if (maxY <= 0)
            return
        const y = Math.max(0, Math.min(maxY, mouseY - knob.height / 2))
        root.throttlePercent = 1 - y / maxY
    }
}
