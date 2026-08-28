#include "CParameterStore.h"

#include <QCoreApplication>
#include <QDir>
#include <QVariantMap>

#include <cmath>

CParameterStore::CParameterStore(QObject *parent)
    : QObject(parent)
{
    const QString iniPath =
        QDir(QCoreApplication::applicationDirPath()).filePath(QStringLiteral("ParaSetttings.ini"));
    m_settings = new QSettings(iniPath, QSettings::IniFormat, this);

    m_parameters = {
        { QStringLiteral("currentOilPumpVoltage"), QStringLiteral("当前油泵电压"), 0.0 },
        { QStringLiteral("controlVoltage"), QStringLiteral("控制电压"), 0.0 },
        { QStringLiteral("powerVoltage"), QStringLiteral("动力电压"), 0.0 },
        { QStringLiteral("current"), QStringLiteral("电流"), 0.0 },
        { QStringLiteral("oilPumpMaxVoltage"), QStringLiteral("油泵最大电压"), 0.0 },
        { QStringLiteral("oilPumpIgnitionVoltage"), QStringLiteral("油泵点火电压"), 0.0 },
        { QStringLiteral("speedAccelerationCoefficient"), QStringLiteral("转速加速系数"), 0.0 },
        { QStringLiteral("startTime"), QStringLiteral("启动时间"), 0.0 },
        { QStringLiteral("maxSpeed"), QStringLiteral("最高转速"), 0.0 },
        { QStringLiteral("idleSpeed"), QStringLiteral("怠速转速"), 0.0 }
    };

    loadFromIni();
}

QVariantList CParameterStore::parameters() const
{
    QVariantList result;
    for (const CParameter &parameter : m_parameters) {
        QVariantMap item;
        item.insert(QStringLiteral("key"), parameter.key);
        item.insert(QStringLiteral("name"), parameter.name);
        item.insert(QStringLiteral("currentValue"), parameter.currentValue);
        result.append(item);
    }
    return result;
}

QVariantList CParameterStore::currentValues() const
{
    QVariantList result;
    for (const CParameter &parameter : m_parameters)
        result.append(parameter.currentValue);
    return result;
}

QVariantList CParameterStore::editValues() const
{
    QVariantList result;
    for (const CParameter &parameter : m_parameters)
        result.append(parameter.editValue);
    return result;
}

bool CParameterStore::hasChanges() const
{
    return m_hasChanges;
}

int CParameterStore::parameterCount() const
{
    return m_parameters.size();
}

QString CParameterStore::parameterName(int index) const
{
    if (index < 0 || index >= m_parameters.size())
        return QString();
    return m_parameters.at(index).name;
}

double CParameterStore::currentValueAt(int index) const
{
    if (index < 0 || index >= m_parameters.size())
        return 0.0;
    return m_parameters.at(index).currentValue;
}

double CParameterStore::editValueAt(int index) const
{
    if (index < 0 || index >= m_parameters.size())
        return 0.0;
    return m_parameters.at(index).editValue;
}

void CParameterStore::setEditValue(int index, double value)
{
    if (index < 0 || index >= m_parameters.size() || !std::isfinite(value))
        return;

    m_parameters[index].editValue = value;
    updateHasChanges();
}

void CParameterStore::applyChanges()
{
    if (!m_settings)
        return;

    m_settings->beginGroup(QStringLiteral("Parameters"));
    for (CParameter &parameter : m_parameters) {
        parameter.currentValue = parameter.editValue;
        m_settings->setValue(parameter.key, parameter.currentValue);
    }
    m_settings->endGroup();
    m_settings->sync();

    m_hasChanges = false;
    emit parametersChanged();
    emit editsChanged();
    emit hasChangesChanged();
}

void CParameterStore::revertChanges()
{
    for (CParameter &parameter : m_parameters)
        parameter.editValue = parameter.currentValue;

    m_hasChanges = false;
    emit editsChanged();
    emit hasChangesChanged();
}

void CParameterStore::loadFromIni()
{
    if (!m_settings)
        return;

    m_settings->beginGroup(QStringLiteral("Parameters"));
    for (CParameter &parameter : m_parameters) {
        const double savedValue = m_settings->value(parameter.key, parameter.currentValue).toDouble();
        parameter.currentValue = savedValue;
        parameter.editValue = savedValue;
    }
    m_settings->endGroup();
}

void CParameterStore::updateHasChanges()
{
    bool dirty = false;
    for (const CParameter &parameter : m_parameters) {
        if (std::abs(parameter.currentValue - parameter.editValue) > 1e-9) {
            dirty = true;
            break;
        }
    }

    if (dirty != m_hasChanges) {
        m_hasChanges = dirty;
        emit hasChangesChanged();
    }
}
