#include "CCommManager.h"

#include <QCoreApplication>
#include <QDateTime>
#include <QDebug>
#include <QFile>
#include <QSerialPortInfo>

/* 临时调试: 记录串口收发与油门下发, 便于联调定位(验证后可移除) */
static void debugLog(const QString &msg)
{
    QFile f(QCoreApplication::applicationDirPath() + QStringLiteral("/comm_debug.log"));
    if (f.open(QIODevice::Append | QIODevice::Text)) {
        f.write((QDateTime::currentDateTime().toString(QStringLiteral("hh:mm:ss.zzz "))
                 + msg + QStringLiteral("\n")).toUtf8());
    }
}

/* ============================================================================
 * CRC16-Modbus 查表(多项式 0xA001, 初值 0xFFFF, 与 MCU 下位机一致)
 * ==========================================================================*/
static const quint16 kCrcTable[256] = {
    0x0000, 0xC0C1, 0xC181, 0x0140, 0xC301, 0x03C0, 0x0280, 0xC241,
    0xC601, 0x06C0, 0x0780, 0xC741, 0x0500, 0xC5C1, 0xC481, 0x0440,
    0xCC01, 0x0CC0, 0x0D80, 0xCD41, 0x0F00, 0xCFC1, 0xCE81, 0x0E40,
    0x0A00, 0xCAC1, 0xCB81, 0x0B40, 0xC901, 0x09C0, 0x0880, 0xC841,
    0xD801, 0x18C0, 0x1980, 0xD941, 0x1B00, 0xDBC1, 0xDA81, 0x1A40,
    0x1E00, 0xDEC1, 0xDF81, 0x1F40, 0xDD01, 0x1DC0, 0x1C80, 0xDC41,
    0x1400, 0xD4C1, 0xD581, 0x1540, 0xD701, 0x17C0, 0x1680, 0xD641,
    0xD201, 0x12C0, 0x1380, 0xD341, 0x1100, 0xD1C1, 0xD081, 0x1040,
    0xF001, 0x30C0, 0x3180, 0xF141, 0x3300, 0xF3C1, 0xF281, 0x3240,
    0x3600, 0xF6C1, 0xF781, 0x3740, 0xF501, 0x35C0, 0x3480, 0xF441,
    0x3C00, 0xFCC1, 0xFD81, 0x3D40, 0xFF01, 0x3FC0, 0x3E80, 0xFE41,
    0xFA01, 0x3AC0, 0x3B80, 0xFB41, 0x3900, 0xF9C1, 0xF881, 0x3840,
    0x2800, 0xE8C1, 0xE981, 0x2940, 0xEB01, 0x2BC0, 0x2A80, 0xEA41,
    0xEE01, 0x2EC0, 0x2F80, 0xEF41, 0x2D00, 0xEDC1, 0xEC81, 0x2C40,
    0xE401, 0x24C0, 0x2580, 0xE541, 0x2700, 0xE7C1, 0xE681, 0x2640,
    0x2200, 0xE2C1, 0xE381, 0x2340, 0xE101, 0x21C0, 0x2080, 0xE041,
    0xA001, 0x60C0, 0x6180, 0xA141, 0x6300, 0xA3C1, 0xA281, 0x6240,
    0x6600, 0xA6C1, 0xA781, 0x6740, 0xA501, 0x65C0, 0x6480, 0xA441,
    0x6C00, 0xACC1, 0xAD81, 0x6D40, 0xAF01, 0x6FC0, 0x6E80, 0xAE41,
    0xAA01, 0x6AC0, 0x6B80, 0xAB41, 0x6900, 0xA9C1, 0xA881, 0x6840,
    0x7800, 0xB8C1, 0xB981, 0x7940, 0xBB01, 0x7BC0, 0x7A80, 0xBA41,
    0xBE01, 0x7EC0, 0x7F80, 0xBF41, 0x7D00, 0xBDC1, 0xBC81, 0x7C40,
    0xB401, 0x74C0, 0x7580, 0xB541, 0x7700, 0xB7C1, 0xB681, 0x7640,
    0x7200, 0xB2C1, 0xB381, 0x7340, 0xB101, 0x71C0, 0x7080, 0xB041,
    0x5000, 0x90C1, 0x9181, 0x5140, 0x9301, 0x53C0, 0x5280, 0x9241,
    0x9601, 0x56C0, 0x5780, 0x9741, 0x5500, 0x95C1, 0x9481, 0x5440,
    0x9C01, 0x5CC0, 0x5D80, 0x9D41, 0x5F00, 0x9FC1, 0x9E81, 0x5E40,
    0x5A00, 0x9AC1, 0x9B81, 0x5B40, 0x9901, 0x59C0, 0x5880, 0x9841,
    0x8801, 0x48C0, 0x4980, 0x8941, 0x4B00, 0x8BC1, 0x8A81, 0x4A40,
    0x4E00, 0x8EC1, 0x8F81, 0x4F40, 0x8D01, 0x4DC0, 0x4C80, 0x8C41,
    0x4400, 0x84C1, 0x8581, 0x4540, 0x8701, 0x47C0, 0x4680, 0x8641,
    0x8201, 0x42C0, 0x4380, 0x8341, 0x4100, 0x81C1, 0x8081, 0x4040
};

/* ============================================================================
 * 构造/析构
 * ==========================================================================*/
CCommManager::CCommManager(QObject *parent)
    : QObject(parent)
{
    m_port = new QSerialPort(this);

    // 周期轮询从站状态
    m_pollTimer = new QTimer(this);
    m_pollTimer->setInterval(kPollIntervalMs);
    connect(m_pollTimer, &QTimer::timeout, this, &CCommManager::pollStatus);

    // 周期扫描串口热插拔
    m_portScanTimer = new QTimer(this);
    m_portScanTimer->setInterval(3000);
    connect(m_portScanTimer, &QTimer::timeout, this, &CCommManager::scanPorts);
    m_portScanTimer->start();

    // 响应超时
    m_responseTimer = new QTimer(this);
    m_responseTimer->setSingleShot(true);
    m_responseTimer->setInterval(kResponseTimeoutMs);
    connect(m_responseTimer, &QTimer::timeout, this, [this]() {
        markCommError(QStringLiteral("响应超时"));
        m_rxBuffer.clear();
        m_pendingPdu.clear();
        m_awaitingResponse = false;
        sendNextRequest();
    });

    connect(m_port, &QSerialPort::readyRead, this, &CCommManager::onReadyRead);
    connect(m_port, &QSerialPort::errorOccurred, this, &CCommManager::onSerialError);

    m_throttleClock.start();

    // 启动后延时枚举可用串口，由界面“打开”按钮手动建立连接。
    QTimer::singleShot(600, this, [this]() {
        refreshPorts();
    });
}

CCommManager::~CCommManager() = default;

/* ============================================================================
 * 属性访问
 * ==========================================================================*/
QStringList CCommManager::portNames() const { return m_portNames; }
QString CCommManager::currentPort() const { return m_currentPort; }
bool CCommManager::connected() const { return m_connected; }
bool CCommManager::controlEngaged() const { return m_controlEngaged; }
int CCommManager::engineState() const { return m_regs[0]; }
int CCommManager::faultCode() const { return m_regs[5]; }
int CCommManager::motorSpeedPercent() const { return m_motorSpeedPercent; }
int CCommManager::dutyPercent() const { return m_dutyPercent; }
int CCommManager::pwmFreqHz() const { return m_pwmFreqHz; }
int CCommManager::firmwareVersion() const { return m_regs[7]; }
int CCommManager::commOkCount() const { return m_regs[9]; }
int CCommManager::commErrCount() const { return m_regs[8]; }
QString CCommManager::lastMessage() const { return m_lastMessage; }

QString CCommManager::connectionStatus() const
{
    if (m_connected)
        return QStringLiteral("已连接 %1").arg(m_currentPort);
    return QStringLiteral("未连接");
}

QString CCommManager::engineStateText() const
{
    if (!m_connected)
        return QStringLiteral("未连接");
    if (!m_hasStatus)
        return QStringLiteral("连接中…");
    return m_regs[0] == 1 ? QStringLiteral("运行") : QStringLiteral("停止");
}

QString CCommManager::faultText() const
{
    if (!m_connected || !m_hasStatus)
        return QStringLiteral("--");
    if (m_regs[5] == 0)
        return QStringLiteral("无");
    return QStringLiteral("0x%1").arg(m_regs[5], 4, 16, QLatin1Char('0')).toUpper();
}

void CCommManager::setControlEngaged(bool engaged)
{
    debugLog(QStringLiteral("setControlEngaged(%1)").arg(engaged));
    if (m_controlEngaged == engaged)
        return;
    m_controlEngaged = engaged;
    emit controlEngagedChanged();

    if (engaged) {
        // 进入控制模式: 立即下发当前油门(转速)
        applyThrottleNow();
        setLastMessage(QStringLiteral("控制已开启"));
    } else {
        // 关闭控制: 安全起见停止电机
        sendStop();
        setLastMessage(QStringLiteral("控制已关闭"));
    }
}

/* ============================================================================
 * 串口管理
 * ==========================================================================*/
void CCommManager::refreshPorts()
{
    const QStringList current = m_portNames;
    m_portNames.clear();
    const auto ports = QSerialPortInfo::availablePorts();
    for (const QSerialPortInfo &info : ports) {
        const QString name = info.portName();
        if (!name.isEmpty())
            m_portNames.append(name);
    }
    m_portNames.sort();

    if (m_portNames != current)
        emit portNamesChanged();
}

void CCommManager::scanPorts()
{
    const QString connectedName = m_currentPort;
    refreshPorts();

    // 当前端口被拔出
    if (m_connected && !m_portNames.contains(connectedName)) {
        closePort();
        setLastMessage(QStringLiteral("串口 %1 已断开").arg(connectedName));
    }
}

void CCommManager::applyPortConfig()
{
    m_port->setBaudRate(m_baudRate);
    m_port->setDataBits(m_dataBits);
    m_port->setParity(QSerialPort::NoParity);     // 与 MCU 默认 8N1 一致(部分 USB-TTL 适配器对 8E1 校验位支持不标准)
    m_port->setStopBits(QSerialPort::OneStop);
    m_port->setFlowControl(QSerialPort::NoFlowControl);
}

void CCommManager::openPort(const QString &portName)
{
    if (portName.isEmpty())
        return;
    if (m_connected && m_currentPort == portName)
        return;

    closePort();
    m_currentPort = portName;

    m_port->setPortName(portName);
    applyPortConfig();

    if (!m_port->open(QIODevice::ReadWrite)) {
        setLastMessage(QStringLiteral("打开 %1 失败: %2")
                           .arg(portName, m_port->errorString()));
        emit connectionChanged();
        return;
    }

    m_connected = true;
    m_hasStatus = false;
    m_rxBuffer.clear();
    m_requestQueue.clear();
    m_pendingPdu.clear();
    m_awaitingResponse = false;

    m_pollTimer->start();
    setLastMessage(QStringLiteral("已连接 %1 (%2)").arg(portName).arg(m_baudRate));
    emit connectionChanged();

    // 连接成功后立即请求一次状态
    queueRequest(buildReadPdu(0x0000, 10));
}

void CCommManager::closePort()
{
    if (m_port->isOpen()) {
        m_port->close();
        m_connected = false;
        m_pollTimer->stop();
        m_rxBuffer.clear();
        m_requestQueue.clear();
        m_pendingPdu.clear();
        m_awaitingResponse = false;
        m_responseTimer->stop();
        emit connectionChanged();
    }
}

void CCommManager::onSerialError(QSerialPort::SerialPortError error)
{
    if (error == QSerialPort::NoError)
        return;
    setLastMessage(QStringLiteral("串口错误: %1").arg(m_port->errorString()));
    if (error == QSerialPort::ResourceError || error == QSerialPort::DeviceNotFoundError) {
        closePort();
    }
}

/* ============================================================================
 * Modbus-RTU 组帧
 * ==========================================================================*/
quint16 CCommManager::crc16(const QByteArray &data)
{
    quint16 crc = 0xFFFF;
    for (char ch : data) {
        crc = static_cast<quint16>((crc >> 8) ^ kCrcTable[(crc ^ static_cast<quint8>(ch)) & 0xFF]);
    }
    return crc;
}

QByteArray CCommManager::buildReadPdu(quint16 startAddr, quint16 count)
{
    QByteArray pdu;
    pdu.append(static_cast<char>(0x03));
    pdu.append(static_cast<char>((startAddr >> 8) & 0xFF));
    pdu.append(static_cast<char>(startAddr & 0xFF));
    pdu.append(static_cast<char>((count >> 8) & 0xFF));
    pdu.append(static_cast<char>(count & 0xFF));
    return pdu;
}

QByteArray CCommManager::buildWriteSinglePdu(quint16 addr, quint16 value)
{
    QByteArray pdu;
    pdu.append(static_cast<char>(0x06));
    pdu.append(static_cast<char>((addr >> 8) & 0xFF));
    pdu.append(static_cast<char>(addr & 0xFF));
    pdu.append(static_cast<char>((value >> 8) & 0xFF));
    pdu.append(static_cast<char>(value & 0xFF));
    return pdu;
}

/* ============================================================================
 * 请求发送与响应处理
 * ==========================================================================*/
void CCommManager::queueRequest(const QByteArray &pdu)
{
    if (pdu.isEmpty())
        return;
    m_requestQueue.append(pdu);
    sendNextRequest();
}

void CCommManager::sendNextRequest()
{
    if (!m_connected || m_awaitingResponse || m_requestQueue.isEmpty())
        return;

    const QByteArray pdu = m_requestQueue.takeFirst();
    m_pendingPdu = pdu;

    // 依据请求功能码计算期望响应长度
    const quint8 func = static_cast<quint8>(pdu.at(0));
    int expectedLen = 0;
    if (func == 0x03) {
        const quint16 count = static_cast<quint16>((static_cast<quint8>(pdu.at(3)) << 8)
                                                   | static_cast<quint8>(pdu.at(4)));
        expectedLen = 5 + 2 * static_cast<int>(count);   // 地址+功能+字节数+数据+CRC
    } else if (func == 0x06) {
        expectedLen = 8;                                  // 回显请求
    } else {
        // 未知功能码按帧间隔方式处理
        expectedLen = 0;
    }
    Q_UNUSED(expectedLen);

    QByteArray frame;
    frame.append(static_cast<char>(m_slaveAddr));
    frame.append(pdu);
    const quint16 crc = crc16(frame);
    frame.append(static_cast<char>(crc & 0xFF));
    frame.append(static_cast<char>((crc >> 8) & 0xFF));

    m_rxBuffer.clear();
    m_awaitingResponse = true;
    m_responseTimer->start();

    m_port->write(frame);
    m_port->flush();
    debugLog(QStringLiteral("TX: %1").arg(QString::fromLatin1(frame.toHex(' '))));
}

void CCommManager::onReadyRead()
{
    if (!m_awaitingResponse) {
        // 无挂起请求时收到数据, 丢弃(可能为总线噪音)
        m_port->readAll();
        return;
    }

    m_rxBuffer.append(m_port->readAll());

    // 依据挂起请求计算期望响应长度
    int expectedLen = 0;
    if (!m_pendingPdu.isEmpty()) {
        const quint8 func = static_cast<quint8>(m_pendingPdu.at(0));
        if (func == 0x03) {
            const quint16 count = static_cast<quint16>((static_cast<quint8>(m_pendingPdu.at(3)) << 8)
                                                       | static_cast<quint8>(m_pendingPdu.at(4)));
            expectedLen = 5 + 2 * static_cast<int>(count);
        } else if (func == 0x06) {
            expectedLen = 8;
        }
    }

    // 响应足够时立即解析(等待响应超时兜底)
    if (expectedLen > 0 && m_rxBuffer.size() >= expectedLen) {
        QByteArray frame = m_rxBuffer.left(expectedLen);
        m_rxBuffer.remove(0, expectedLen);
        onResponseReady(frame);
    }
}

void CCommManager::onResponseReady(const QByteArray &frame)
{
    m_responseTimer->stop();
    m_awaitingResponse = false;
    m_pendingPdu.clear();

    // 最小帧: 地址(1) + 功能码(1) + CRC(2)
    if (frame.size() < 4) {
        markCommError(QStringLiteral("响应帧过短"));
        sendNextRequest();
        return;
    }

    // 地址匹配(仅响应本从站)
    if (static_cast<quint8>(frame.at(0)) != m_slaveAddr) {
        markCommError(QStringLiteral("响应地址不匹配"));
        sendNextRequest();
        return;
    }

    // CRC 校验
    const QByteArray body = frame.left(frame.size() - 2);
    const quint16 crcRx = static_cast<quint16>((static_cast<quint8>(frame.at(frame.size() - 1)) << 8)
                                               | static_cast<quint8>(frame.at(frame.size() - 2)));
    if (crc16(body) != crcRx) {
        markCommError(QStringLiteral("响应 CRC 校验失败"));
        sendNextRequest();
        return;
    }

    // PDU 从功能码开始
    const QByteArray pdu = frame.mid(1, frame.size() - 3);
    const quint8 func = static_cast<quint8>(pdu.at(0));

    if (func & 0x80) {
        handleException(static_cast<quint8>(func & 0x7F), static_cast<quint8>(pdu.at(1)));
    } else {
        handleResponse(pdu);
    }

    sendNextRequest();
}

void CCommManager::handleResponse(const QByteArray &pdu)
{
    const quint8 func = static_cast<quint8>(pdu.at(0));

    if (func == 0x03 && pdu.size() >= 3) {
        const int byteCount = static_cast<quint8>(pdu.at(1));
        if (pdu.size() >= byteCount + 2)
            updateRegisters(pdu.mid(2, byteCount));
    } else if (func == 0x06 && pdu.size() >= 5) {
        // 写单个寄存器回显确认; 同步本地缓存
        const quint16 addr = static_cast<quint16>((static_cast<quint8>(pdu.at(1)) << 8)
                                                  | static_cast<quint8>(pdu.at(2)));
        const quint16 value = static_cast<quint16>((static_cast<quint8>(pdu.at(3)) << 8)
                                                   | static_cast<quint8>(pdu.at(4)));
        if (addr < 10)
            m_regs[addr] = value;
        if (addr == 2)
            m_motorSpeedPercent = value;
        if (addr == 3)
            m_pwmFreqHz = value;
        emit statusUpdated();
        setLastMessage(QStringLiteral("写入 0x%1 = %2").arg(addr, 4, 16, QLatin1Char('0')).arg(value));
    }
}

void CCommManager::handleException(quint8 func, quint8 code)
{
    QString codeText;
    switch (code) {
    case 0x01: codeText = QStringLiteral("非法功能码"); break;
    case 0x02: codeText = QStringLiteral("非法数据地址"); break;
    case 0x03: codeText = QStringLiteral("非法数据值"); break;
    default:   codeText = QStringLiteral("异常码 0x%1").arg(code, 2, 16, QLatin1Char('0')); break;
    }
    markCommError(QStringLiteral("功能 0x%1 响应异常: %2")
                      .arg(func, 2, 16, QLatin1Char('0'))
                      .arg(codeText));
}

void CCommManager::updateRegisters(const QByteArray &data)
{
    const int n = qMin(data.size() / 2, 10);
    for (int i = 0; i < n; ++i) {
        m_regs[i] = static_cast<quint16>((static_cast<quint8>(data.at(i * 2)) << 8)
                                         | static_cast<quint8>(data.at(i * 2 + 1)));
    }
    m_hasStatus = true;
    m_motorSpeedPercent = m_regs[2];
    m_dutyPercent = m_regs[4];
    m_pwmFreqHz = m_regs[3];
    emit statusUpdated();
}

void CCommManager::markCommError(const QString &reason)
{
    qWarning().noquote() << "[HostSoftware]" << reason;
    setLastMessage(reason);
}

/* ============================================================================
 * 对外控制命令
 * ==========================================================================*/
void CCommManager::pollStatus()
{
    if (m_connected && !m_awaitingResponse && m_requestQueue.isEmpty())
        queueRequest(buildReadPdu(0x0000, 10));
}

void CCommManager::requestStatus()
{
    queueRequest(buildReadPdu(0x0000, 10));
}

void CCommManager::sendStart()
{
    queueRequest(buildWriteSinglePdu(0x0001, 1));
}

void CCommManager::sendStop()
{
    queueRequest(buildWriteSinglePdu(0x0001, 0));
}

void CCommManager::setSpeedPercent(int percent)
{
    percent = qBound(0, percent, 100);
    m_motorSpeedPercent = percent;
    if (!m_controlEngaged || !m_connected)
        return;
    queueRequest(buildWriteSinglePdu(0x0002, static_cast<quint16>(percent)));
}

void CCommManager::setThrottlePercent(int percent)
{
    percent = qBound(0, percent, 100);
    m_motorSpeedPercent = percent;
    debugLog(QStringLiteral("setThrottlePercent(%1) engaged=%2 connected=%3 lastSent=%4")
                 .arg(percent).arg(m_controlEngaged).arg(m_connected).arg(m_lastSentSpeed));

    // 防抖: 值未变化或间隔过短时不重复下发
    if (percent == m_lastSentSpeed
        && m_throttleClock.isValid()
        && m_throttleClock.elapsed() < kThrottleMinIntervalMs) {
        return;
    }

    if (!m_controlEngaged || !m_connected) {
        m_lastSentSpeed = percent;
        return;
    }

    m_lastSentSpeed = percent;
    m_throttleClock.restart();
    queueRequest(buildWriteSinglePdu(0x0002, static_cast<quint16>(percent)));
}

void CCommManager::applyThrottleNow()
{
    setThrottlePercent(m_motorSpeedPercent);
}

void CCommManager::setPwmFrequency(int hz)
{
    hz = qBound(1000, hz, 10000);
    m_pwmFreqHz = hz;
    if (!m_connected)
        return;
    queueRequest(buildWriteSinglePdu(0x0003, static_cast<quint16>(hz)));
}

void CCommManager::setBaudRate(int baud)
{
    if (baud <= 0 || baud == m_baudRate)
        return;
    m_baudRate = baud;
    if (m_connected) {
        applyPortConfig();
        setLastMessage(QStringLiteral("波特率已切换为 %1").arg(baud));
    }
}

void CCommManager::setDataBits(int bits)
{
    QSerialPort::DataBits dataBits = QSerialPort::Data8;
    switch (bits) {
    case 5: dataBits = QSerialPort::Data5; break;
    case 6: dataBits = QSerialPort::Data6; break;
    case 7: dataBits = QSerialPort::Data7; break;
    case 8: dataBits = QSerialPort::Data8; break;
    default: dataBits = QSerialPort::Data8; break;
    }
    if (dataBits == m_dataBits)
        return;
    m_dataBits = dataBits;
    if (m_connected) {
        applyPortConfig();
        setLastMessage(QStringLiteral("数据位已切换为 %1").arg(bits));
    }
}

void CCommManager::setLastMessage(const QString &text)
{
    if (m_lastMessage == text)
        return;
    m_lastMessage = text;
    qInfo().noquote() << "[HostSoftware]" << text;
    emit logChanged();
}
