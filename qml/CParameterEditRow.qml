import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

RowLayout {
    id: control

    property var parameterStore: null
    property int parameterIndex: 0

    Layout.fillWidth: true
    Layout.preferredHeight: 42
    spacing: 10

    Text {
        text: control.parameterStore.parameterName(control.parameterIndex)
        font.pixelSize: 16
        color: theme.textPrimary
        Layout.preferredWidth: 190
    }

    Text {
        text: Number(control.parameterStore.currentValues[control.parameterIndex]).toFixed(1)
        font.pixelSize: 15
        font.family: "Arial"
        color: theme.textMuted
        Layout.preferredWidth: 120
    }

    TextField {
        Layout.fillWidth: true
        text: control.parameterStore.editValues[control.parameterIndex]
        font.pixelSize: 15
        font.family: "Arial"
        color: theme.textPrimary
        placeholderTextColor: theme.textMuted
        selectionColor: theme.accentGreen
        selectedTextColor: "#ffffff"
        background: Rectangle {
            radius: 4
            color: theme.inputBackground
            border.color: theme.inputBorder
        }
        validator: DoubleValidator {
            bottom: -1000000
            top: 1000000
            decimals: 6
        }
        onTextEdited: control.parameterStore.setEditValue(control.parameterIndex, Number(text))
    }
}
