import QtQuick
import QtQuick.Controls

Item {
    id: control

    property var model: []
    property int currentIndex: 0
    signal activated(int index)

    readonly property string displayText:
        control.currentIndex >= 0 && control.currentIndex < control.model.length
            ? String(control.model[control.currentIndex])
            : ""

    implicitWidth: 120
    implicitHeight: 38

    Rectangle {
        id: field
        anchors.fill: parent
        radius: 4
        color: theme.inputBackground
        border.color: theme.inputBorder

        Text {
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.right: arrow.left
            anchors.rightMargin: 6
            anchors.verticalCenter: parent.verticalCenter
            text: control.displayText
            color: theme.textPrimary
            font.pixelSize: 13
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }

        Text {
            id: arrow
            anchors.right: parent.right
            anchors.rightMargin: 8
            anchors.verticalCenter: parent.verticalCenter
            text: "\u25BE"
            color: theme.textMuted
            font.pixelSize: 14
        }

        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            onClicked: menu.visible ? menu.close() : menu.open()
        }
    }

    Popup {
        id: menu
        y: control.height + 2
        width: control.width
        height: Math.min(control.model.length * 36 + 4, 320)
        padding: 2
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutsideParent

        background: Rectangle {
            radius: 4
            color: theme.menuBackground
            border.color: theme.blockBorder
        }

        contentItem: Column {
            width: control.width - 4
            spacing: 2

            Repeater {
                model: control.model

                delegate: Rectangle {
                    required property int index
                    required property var modelData

                    width: control.width - 4
                    height: 34
                    radius: 2
                    color: itemMouse.containsMouse || control.currentIndex === index
                           ? theme.menuHighlight : "transparent"

                    Text {
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 10
                        text: modelData
                        color: itemMouse.containsMouse || control.currentIndex === index
                               ? theme.menuHighlightText : theme.textPrimary
                        font.pixelSize: 13
                        verticalAlignment: Text.AlignVCenter
                        elide: Text.ElideRight
                    }

                    MouseArea {
                        id: itemMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: {
                            control.currentIndex = index
                            control.activated(index)
                            menu.close()
                        }
                    }
                }
            }
        }
    }
}
