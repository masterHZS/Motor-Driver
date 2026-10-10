#pragma once

#include <QObject>
#include <QSettings>
#include <QVariantList>
#include <QVector>

class QSettings;

class CParameterStore : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantList parameters READ parameters NOTIFY parametersChanged)
    Q_PROPERTY(QVariantList currentValues READ currentValues NOTIFY parametersChanged)
    Q_PROPERTY(QVariantList editValues READ editValues NOTIFY editsChanged)
    Q_PROPERTY(bool hasChanges READ hasChanges NOTIFY hasChangesChanged)
    Q_PROPERTY(int parameterCount READ parameterCount CONSTANT)

public:
    explicit CParameterStore(QObject *parent = nullptr);

    QVariantList parameters() const;
    QVariantList currentValues() const;
    QVariantList editValues() const;
    bool hasChanges() const;
    int parameterCount() const;

    Q_INVOKABLE QString parameterName(int index) const;
    Q_INVOKABLE double currentValueAt(int index) const;
    Q_INVOKABLE double editValueAt(int index) const;
    Q_INVOKABLE void setEditValue(int index, double value);
    Q_INVOKABLE void applyChanges();
    Q_INVOKABLE void revertChanges();

signals:
    void parametersChanged();
    void editsChanged();
    void hasChangesChanged();

private:
    struct CParameter
    {
        QString key;
        QString name;
        double currentValue = 0.0;
        double editValue = 0.0;
    };

    void loadFromIni();
    void updateHasChanges();

    QVector<CParameter> m_parameters;
    QSettings *m_settings = nullptr;
    bool m_hasChanges = false;
};
