#pragma once

#include <QColor>
#include <QObject>

class CTheme : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool darkMode READ darkMode WRITE setDarkMode NOTIFY darkModeChanged)
    Q_PROPERTY(QColor windowBackground READ windowBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor panelBackground READ panelBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor blockBackground READ blockBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor blockBorder READ blockBorder NOTIFY darkModeChanged)
    Q_PROPERTY(QColor outerBorder READ outerBorder NOTIFY darkModeChanged)
    Q_PROPERTY(QColor textPrimary READ textPrimary NOTIFY darkModeChanged)
    Q_PROPERTY(QColor textSecondary READ textSecondary NOTIFY darkModeChanged)
    Q_PROPERTY(QColor textMuted READ textMuted NOTIFY darkModeChanged)
    Q_PROPERTY(QColor accentGreen READ accentGreen NOTIFY darkModeChanged)
    Q_PROPERTY(QColor accentRed READ accentRed NOTIFY darkModeChanged)
    Q_PROPERTY(QColor accentAmber READ accentAmber NOTIFY darkModeChanged)
    Q_PROPERTY(QColor lcdBackground READ lcdBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor lcdBorder READ lcdBorder NOTIFY darkModeChanged)
    Q_PROPERTY(QColor lcdText READ lcdText NOTIFY darkModeChanged)
    Q_PROPERTY(QColor gaugeBackground READ gaugeBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor gaugeTickMajor READ gaugeTickMajor NOTIFY darkModeChanged)
    Q_PROPERTY(QColor gaugeTickMinor READ gaugeTickMinor NOTIFY darkModeChanged)
    Q_PROPERTY(QColor trackBackground READ trackBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor separator READ separator NOTIFY darkModeChanged)
    Q_PROPERTY(QColor overlay READ overlay NOTIFY darkModeChanged)
    Q_PROPERTY(QColor errorText READ errorText NOTIFY darkModeChanged)
    Q_PROPERTY(QColor disabledBackground READ disabledBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor disabledBorder READ disabledBorder NOTIFY darkModeChanged)
    Q_PROPERTY(QColor disabledText READ disabledText NOTIFY darkModeChanged)
    Q_PROPERTY(QColor inputBackground READ inputBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor inputBorder READ inputBorder NOTIFY darkModeChanged)
    Q_PROPERTY(QColor menuBackground READ menuBackground NOTIFY darkModeChanged)
    Q_PROPERTY(QColor menuHighlight READ menuHighlight NOTIFY darkModeChanged)
    Q_PROPERTY(QColor menuHighlightText READ menuHighlightText NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonNeutral READ buttonNeutral NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonNeutralPressed READ buttonNeutralPressed NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonGreen READ buttonGreen NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonGreenPressed READ buttonGreenPressed NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonRed READ buttonRed NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonRedPressed READ buttonRedPressed NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonTeal READ buttonTeal NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonTealPressed READ buttonTealPressed NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonGray READ buttonGray NOTIFY darkModeChanged)
    Q_PROPERTY(QColor buttonGrayPressed READ buttonGrayPressed NOTIFY darkModeChanged)
    Q_PROPERTY(QColor stateInactive READ stateInactive NOTIFY darkModeChanged)

public:
    explicit CTheme(QObject *parent = nullptr);

    bool darkMode() const;
    void setDarkMode(bool darkMode);
    Q_INVOKABLE void toggleDarkMode();

    QColor windowBackground() const;
    QColor panelBackground() const;
    QColor blockBackground() const;
    QColor blockBorder() const;
    QColor outerBorder() const;
    QColor textPrimary() const;
    QColor textSecondary() const;
    QColor textMuted() const;
    QColor accentGreen() const;
    QColor accentRed() const;
    QColor accentAmber() const;
    QColor lcdBackground() const;
    QColor lcdBorder() const;
    QColor lcdText() const;
    QColor gaugeBackground() const;
    QColor gaugeTickMajor() const;
    QColor gaugeTickMinor() const;
    QColor trackBackground() const;
    QColor separator() const;
    QColor overlay() const;
    QColor errorText() const;
    QColor disabledBackground() const;
    QColor disabledBorder() const;
    QColor disabledText() const;
    QColor inputBackground() const;
    QColor inputBorder() const;
    QColor menuBackground() const;
    QColor menuHighlight() const;
    QColor menuHighlightText() const;
    QColor buttonNeutral() const;
    QColor buttonNeutralPressed() const;
    QColor buttonGreen() const;
    QColor buttonGreenPressed() const;
    QColor buttonRed() const;
    QColor buttonRedPressed() const;
    QColor buttonTeal() const;
    QColor buttonTealPressed() const;
    QColor buttonGray() const;
    QColor buttonGrayPressed() const;
    QColor stateInactive() const;

signals:
    void darkModeChanged();

private:
    bool m_darkMode = false;
};
