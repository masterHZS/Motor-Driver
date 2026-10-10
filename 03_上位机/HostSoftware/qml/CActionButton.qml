import QtQuick
import QtQuick.Controls

Button {
    id: control

    property color buttonColor: theme.buttonNeutral
    property color pressedColor: theme.buttonNeutralPressed

    implicitWidth: 120
    implicitHeight: 42
    font.pixelSize: 15
    font.bold: true

    background: Rectangle {
        radius: 4
        color: control.enabled ? (control.down ? control.pressedColor : control.buttonColor) : theme.disabledBackground
        border.color: control.enabled ? Qt.darker(control.buttonColor, 1.1) : theme.disabledBorder
    }

    contentItem: Text {
        text: control.text
        color: control.enabled ? "#ffffff" : theme.disabledText
        font: control.font
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
}
