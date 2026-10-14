#pragma once

#include <QByteArray>
#include <QElapsedTimer>
#include <QList>
#include <QObject>
#include <QSerialPort>
#include <QString>
#include <QStringList>
#include <QTimer>

/**
 * @brief 上位机串口通信管理类(Modbus-RTU 主站)
 *
 * 职责:
 *   - 枚举/打开/关闭串口(DAPLink virtual UART)
 *   - 按《MCU 下位机通信协议》组帧发送 Modbus-RTU 请求
 *   - 解析从站响应并缓存运行状态(寄存器 0x0000~0x0009)
 *   - 周期性轮询状态, 供 QML 界面刷新显示
 *
 * 通信参数(与 MCU 默认一致):
 *   9600-8N1(数据位 8 / 无校验 / 1 停止位), 从站地址 1；PC 通过 USB-TTL/DAPLink
 *   直接连接 F005 UART0。原 8E1 因部分 USB-TTL 适配器校验位不标准，已改为 8N1。
 *
 * 说明: 本类仅提供后端逻辑与 QML 属性/方法, 不包含任何界面元素,
 *       现有 UI 布局保持不变。
 */
class CCommManager : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QStringList portNames READ portNames NOTIFY portNamesChanged)
    Q_PROPERTY(QString currentPort READ currentPort NOTIFY connectionChanged)
    Q_PROPERTY(bool connected READ connected NOTIFY connectionChanged)
    Q_PROPERTY(QString connectionStatus READ connectionStatus NOTIFY connectionChanged)
    Q_PROPERTY(bool controlEngaged READ controlEngaged WRITE setControlEngaged NOTIFY controlEngagedChanged)
    Q_PROPERTY(int engineState READ engineState NOTIFY statusUpdated)
    Q_PROPERTY(QString engineStateText READ engineStateText NOTIFY statusUpdated)
    Q_PROPERTY(int faultCode READ faultCode NOTIFY statusUpdated)
    Q_PROPERTY(QString faultText READ faultText NOTIFY statusUpdated)
    Q_PROPERTY(int motorSpeedPercent READ motorSpeedPercent NOTIFY statusUpdated)
    Q_PROPERTY(int dutyPercent READ dutyPercent NOTIFY statusUpdated)
    Q_PROPERTY(int pwmFreqHz READ pwmFreqHz NOTIFY statusUpdated)
    Q_PROPERTY(int electricalHz READ electricalHz NOTIFY statusUpdated)
    Q_PROPERTY(int firmwareVersion READ firmwareVersion NOTIFY statusUpdated)
    Q_PROPERTY(int commOkCount READ commOkCount NOTIFY statusUpdated)
    Q_PROPERTY(int commErrCount READ commErrCount NOTIFY statusUpdated)
    Q_PROPERTY(QString lastMessage READ lastMessage NOTIFY logChanged)

public:
    explicit CCommManager(QObject *parent = nullptr);
    ~CCommManager() override;

    // ---------- 属性访问 ----------
    QStringList portNames() const;
    QString currentPort() const;
    bool connected() const;
    QString connectionStatus() const;
    bool controlEngaged() const;
    Q_INVOKABLE void setControlEngaged(bool engaged);

    int engineState() const;
    QString engineStateText() const;
    int faultCode() const;
    QString faultText() const;
    int motorSpeedPercent() const;
    int dutyPercent() const;
    int pwmFreqHz() const;
    int electricalHz() const;
    int firmwareVersion() const;
    int commOkCount() const;
    int commErrCount() const;
    QString lastMessage() const;

    // ---------- QML 可调用方法 ----------
    Q_INVOKABLE void refreshPorts();
    Q_INVOKABLE void openPort(const QString &portName);
    Q_INVOKABLE void closePort();
    Q_INVOKABLE void sendStart();
    Q_INVOKABLE void sendStop();
    Q_INVOKABLE void setSpeedPercent(int percent);
    Q_INVOKABLE void setThrottlePercent(int percent);
    Q_INVOKABLE void setPwmFrequency(int hz);
    Q_INVOKABLE void setBaudRate(int baud);
    Q_INVOKABLE void setDataBits(int bits);
    Q_INVOKABLE void requestStatus();

signals:
    void portNamesChanged();
    void connectionChanged();
    void controlEngagedChanged();
    void statusUpdated();
    void logChanged();

private:
    // ---------- Modbus-RTU 主站内部实现 ----------
    static quint16 crc16(const QByteArray &data);
    static QByteArray buildReadPdu(quint16 startAddr, quint16 count);
    static QByteArray buildWriteSinglePdu(quint16 addr, quint16 value);

    void sendNextRequest();
    void queueRequest(const QByteArray &pdu);
    void onResponseReady(const QByteArray &frame);
    void handleResponse(const QByteArray &pdu);
    void handleException(quint8 func, quint8 code);
    void markCommError(const QString &reason);

    // ---------- 串口处理 ----------
    void onReadyRead();
    void onSerialError(QSerialPort::SerialPortError error);
    void pollStatus();
    void scanPorts();
    void applyPortConfig();

    void updateRegisters(const QByteArray &data);
    void setLastMessage(const QString &text);
    void applyThrottleNow();

    // ---------- 成员 ----------
    QSerialPort *m_port = nullptr;
    QTimer *m_pollTimer = nullptr;
    QTimer *m_portScanTimer = nullptr;
    QTimer *m_frameEndTimer = nullptr;    // RTU 帧间隔定时器
    QTimer *m_responseTimer = nullptr;    // 响应超时定时器
    QElapsedTimer m_throttleClock;

    QByteArray m_rxBuffer;
    QList<QByteArray> m_requestQueue;
    QByteArray m_pendingPdu;              // 正在等待响应的请求 PDU
    bool m_awaitingResponse = false;

    QStringList m_portNames;
    QString m_currentPort;
    bool m_connected = false;
    bool m_controlEngaged = false;

    // 状态缓存(对应 MCU 寄存器 0x0000~0x0009)
    quint16 m_regs[10] = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    bool m_hasStatus = false;

    // 解析后的状态快照
    int m_motorSpeedPercent = 0;
    int m_requestedSpeedPercent = 0;
    int m_dutyPercent = 0;
    int m_pwmFreqHz = 20000;

    // 通信参数
    int m_baudRate = 9600;
    QSerialPort::DataBits m_dataBits = QSerialPort::Data8;
    quint8 m_slaveAddr = 1;

    int m_lastSentSpeed = -1;
    QString m_lastMessage;

    static constexpr int kPollIntervalMs = 250;
    static constexpr int kResponseTimeoutMs = 500;
    static constexpr int kThrottleMinIntervalMs = 40;
};
