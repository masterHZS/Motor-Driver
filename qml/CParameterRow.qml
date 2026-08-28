import QtQuick
import QtQuick.Layouts

RowLayout {
    id: control

    property var parameterStore: null
    property int parameterIndex: 0

    Layout.fillWidth: true
    Layout.fillHeight: true
    Layout.preferredHeight: 32
    Layout.minimumHeight: 26
    spacing: 8

    Text {
        text: control.parameterStore.parameterName(control.parameterIndex) + "："
        font.pixelSize: Math.max(14, Math.min(22, control.height * 0.55))
        color: theme.textSecondary
        Layout.fillWidth: true
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }

    Text {
        text: Number(control.parameterStore.currentValues[control.parameterIndex]).toFixed(1)
        font.pixelSize: Math.max(14, Math.min(22, control.height * 0.55))
        font.family: "Arial"
        font.bold: true
        color: theme.accentGreen
        verticalAlignment: Text.AlignVCenter
    }
}
