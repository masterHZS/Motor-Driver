import QtQuick

Item {
    id: root

    property real value: 0
    property real targetValue: 0
    property real minValue: 0
    property real maxValue: 70000
    property string unit: "rpm"
    property string title: "转速表"
    property real scaleDivisor: 1000

    implicitWidth: 420
    implicitHeight: 300

    Behavior on value {
        NumberAnimation {
            duration: 900
            easing.type: Easing.InOutSine
        }
    }

    onValueChanged: gaugeCanvas.requestPaint()

    Connections {
        target: theme

        function onDarkModeChanged() {
            gaugeCanvas.requestPaint()
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: 8
        color: theme.blockBackground
        border.color: theme.blockBorder
    }

    Canvas {
        id: gaugeCanvas
        anchors.fill: parent

        onPaint: {
            const ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)

            const centerX = width / 2
            const centerY = height * 0.52
            const outerRadius = Math.min(width * 0.33, height * 0.29)
            const startAngle = Math.PI * 150 / 180
            const sweepAngle = Math.PI * 240 / 180

            ctx.lineWidth = outerRadius * 0.10
            ctx.strokeStyle = theme.gaugeBackground
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.arc(centerX, centerY, outerRadius, startAngle, startAngle + sweepAngle, false)
            ctx.stroke()

            const fraction = Math.max(0, Math.min(1,
                (root.value - root.minValue) / (root.maxValue - root.minValue)))
            if (fraction > 0.001) {
                ctx.strokeStyle = theme.accentGreen
                ctx.beginPath()
                ctx.arc(centerX, centerY, outerRadius, startAngle,
                        startAngle + sweepAngle * fraction, false)
                ctx.stroke()
            }

            const tickCount = 15
            const labelCount = 8
            for (let i = 0; i < tickCount; ++i) {
                const angle = startAngle + sweepAngle * i / (tickCount - 1)
                const isMajor = i % 2 === 0
                const tickWidth = isMajor ? Math.max(2, outerRadius * 0.022)
                                          : Math.max(1, outerRadius * 0.012)
                const inner = outerRadius - tickWidth * 2
                ctx.lineWidth = tickWidth
                ctx.strokeStyle = isMajor ? theme.gaugeTickMajor : theme.gaugeTickMinor
                ctx.beginPath()
                ctx.moveTo(centerX + Math.cos(angle) * inner,
                           centerY + Math.sin(angle) * inner)
                ctx.lineTo(centerX + Math.cos(angle) * outerRadius,
                           centerY + Math.sin(angle) * outerRadius)
                ctx.stroke()
            }

            ctx.font = "14px sans-serif"
            ctx.fillStyle = theme.textMuted
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            const labelRadius = outerRadius + ctx.lineWidth * 2 + 16
            for (let i = 0; i < labelCount; ++i) {
                const angle = startAngle + sweepAngle * i / (labelCount - 1)
                const scaledValue = Math.round(root.maxValue * i / (labelCount - 1) / root.scaleDivisor)
                ctx.fillText(String(scaledValue),
                             centerX + Math.cos(angle) * labelRadius,
                             centerY + Math.sin(angle) * labelRadius)
            }

            const valueAngle = startAngle + sweepAngle * fraction
            const pointerLength = outerRadius * 0.82
            ctx.strokeStyle = theme.accentRed
            ctx.lineWidth = Math.max(2, outerRadius * 0.035)
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.moveTo(centerX, centerY)
            ctx.lineTo(centerX + Math.cos(valueAngle) * pointerLength,
                       centerY + Math.sin(valueAngle) * pointerLength)
            ctx.stroke()

            ctx.fillStyle = theme.accentRed
            ctx.beginPath()
            ctx.arc(centerX, centerY, outerRadius * 0.055, 0, Math.PI * 2, false)
            ctx.fill()
        }

        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
    }

    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: 8
        text: root.title
        font.pixelSize: 18
        font.bold: true
        color: theme.textPrimary
    }

    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: 30
        text: (root.scaleDivisor === 1 ? "" : "x" + root.scaleDivisor + " ") + root.unit
        font.pixelSize: 14
        color: theme.textMuted
    }

    Rectangle {
        id: lcd
        anchors.horizontalCenter: parent.horizontalCenter
        y: (root.height + gaugeArcBottom()) / 2 - height / 2
        width: parent.width * 0.40
        height: parent.height * 0.13
        radius: 6
        color: theme.lcdBackground
        border.color: theme.lcdBorder
        border.width: 1.1

        Text {
            anchors.centerIn: parent
            text: Math.round(root.targetValue) + " " + root.unit
            color: theme.lcdText
            font.family: "Arial"
            font.pixelSize: Math.max(16, Math.min(28, parent.height * 0.62))
            font.bold: true
        }
    }

    function gaugeArcBottom()
    {
        const radius = Math.min(width * 0.33, height * 0.29)
        return height * 0.52 + radius * 0.5
    }
}
