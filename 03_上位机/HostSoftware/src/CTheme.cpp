#include "CTheme.h"

CTheme::CTheme(QObject *parent)
    : QObject(parent)
{
}

bool CTheme::darkMode() const
{
    return m_darkMode;
}

void CTheme::setDarkMode(bool darkMode)
{
    if (m_darkMode == darkMode)
        return;
    m_darkMode = darkMode;
    emit darkModeChanged();
}

void CTheme::toggleDarkMode()
{
    setDarkMode(!m_darkMode);
}

QColor CTheme::windowBackground() const
{
    return m_darkMode ? QColor("#111417") : QColor("#eef1f4");
}

QColor CTheme::panelBackground() const
{
    return m_darkMode ? QColor("#171b1f") : QColor("#f8fafc");
}

QColor CTheme::blockBackground() const
{
    return m_darkMode ? QColor("#1e2328") : QColor("#ffffff");
}

QColor CTheme::blockBorder() const
{
    return m_darkMode ? QColor("#3c454d") : QColor("#94a3b8");
}

QColor CTheme::outerBorder() const
{
    return m_darkMode ? QColor("#2a3137") : QColor("#d1d5db");
}

QColor CTheme::textPrimary() const
{
    return m_darkMode ? QColor("#e5e7eb") : QColor("#1e293b");
}

QColor CTheme::textSecondary() const
{
    return m_darkMode ? QColor("#9aa4ad") : QColor("#475569");
}

QColor CTheme::textMuted() const
{
    return m_darkMode ? QColor("#7b8791") : QColor("#64748b");
}

QColor CTheme::accentGreen() const
{
    return m_darkMode ? QColor("#22ff88") : QColor("#00c853");
}

QColor CTheme::accentRed() const
{
    return m_darkMode ? QColor("#ef4444") : QColor("#dc2626");
}

QColor CTheme::accentAmber() const
{
    return m_darkMode ? QColor("#fbbf24") : QColor("#f59e0b");
}

QColor CTheme::lcdBackground() const
{
    return m_darkMode ? QColor("#0f1418") : QColor("#f8fafc");
}

QColor CTheme::lcdBorder() const
{
    return m_darkMode ? QColor("#3f4a52") : QColor("#94a3b8");
}

QColor CTheme::lcdText() const
{
    return m_darkMode ? QColor("#00ff8f") : QColor("#00c853");
}

QColor CTheme::gaugeBackground() const
{
    return m_darkMode ? QColor("#262d33") : QColor("#e2e8f0");
}

QColor CTheme::gaugeTickMajor() const
{
    return m_darkMode ? QColor("#94a3b8") : QColor("#64748b");
}

QColor CTheme::gaugeTickMinor() const
{
    return m_darkMode ? QColor("#52606b") : QColor("#94a3b8");
}

QColor CTheme::trackBackground() const
{
    return m_darkMode ? QColor("#2f3840") : QColor("#d1d5db");
}

QColor CTheme::separator() const
{
    return m_darkMode ? QColor("#37414a") : QColor("#cbd5e1");
}

QColor CTheme::overlay() const
{
    return m_darkMode ? QColor("#cc000000") : QColor("#99000000");
}

QColor CTheme::errorText() const
{
    return m_darkMode ? QColor("#f87171") : QColor("#b91c1c");
}

QColor CTheme::disabledBackground() const
{
    return m_darkMode ? QColor("#2b3238") : QColor("#e2e8f0");
}

QColor CTheme::disabledBorder() const
{
    return m_darkMode ? QColor("#3c454d") : QColor("#cbd5e1");
}

QColor CTheme::disabledText() const
{
    return m_darkMode ? QColor("#6b7280") : QColor("#9ca3af");
}

QColor CTheme::inputBackground() const
{
    return m_darkMode ? QColor("#14191d") : QColor("#ffffff");
}

QColor CTheme::inputBorder() const
{
    return m_darkMode ? QColor("#3f4a52") : QColor("#cbd5e1");
}

QColor CTheme::menuBackground() const
{
    return m_darkMode ? QColor("#252d34") : QColor("#e2e8f0");
}

QColor CTheme::menuHighlight() const
{
    return m_darkMode ? QColor("#1f3a2e") : QColor("#d7f0e3");
}

QColor CTheme::menuHighlightText() const
{
    return m_darkMode ? QColor("#22ff88") : QColor("#00c853");
}

QColor CTheme::buttonNeutral() const
{
    return m_darkMode ? QColor("#3b4754") : QColor("#334155");
}

QColor CTheme::buttonNeutralPressed() const
{
    return m_darkMode ? QColor("#232b33") : QColor("#111827");
}

QColor CTheme::buttonGreen() const
{
    return m_darkMode ? QColor("#16a34a") : QColor("#16a34a");
}

QColor CTheme::buttonGreenPressed() const
{
    return m_darkMode ? QColor("#15803d") : QColor("#15803d");
}

QColor CTheme::buttonRed() const
{
    return m_darkMode ? QColor("#dc2626") : QColor("#dc2626");
}

QColor CTheme::buttonRedPressed() const
{
    return m_darkMode ? QColor("#991b1b") : QColor("#991b1b");
}

QColor CTheme::buttonTeal() const
{
    return m_darkMode ? QColor("#0f766e") : QColor("#0f766e");
}

QColor CTheme::buttonTealPressed() const
{
    return m_darkMode ? QColor("#115e59") : QColor("#115e59");
}

QColor CTheme::buttonGray() const
{
    return m_darkMode ? QColor("#4b5563") : QColor("#64748b");
}

QColor CTheme::buttonGrayPressed() const
{
    return m_darkMode ? QColor("#374151") : QColor("#475569");
}

QColor CTheme::stateInactive() const
{
    return m_darkMode ? QColor("#4b5563") : QColor("#9ca3af");
}
