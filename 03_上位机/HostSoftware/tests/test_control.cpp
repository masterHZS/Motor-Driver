#include <QByteArray>
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QList>
#include <QObject>
#include <QSerialPort>
#include <QStringList>
#include <QTimer>
#include <cassert>
#include <cstdio>

// 仅测试请求队列和缓存；不打开串口、不向真实设备发送命令。
#define private public
#include "CCommManager.h"
#undef private
#include "../src/CCommManager.cpp"

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);
    CCommManager comm;
    comm.setThrottlePercent(35);
    QByteArray telemetry(20, '\0');
    telemetry[13] = 27; // 寄存器6反馈电Hz
    comm.updateRegisters(telemetry); // 旧状态回包不能覆盖尚未发送的用户目标
    comm.sendStart();
    assert(comm.m_controlEngaged);
    assert(comm.m_requestQueue.size() >= 2);
    assert(comm.m_requestQueue.at(comm.m_requestQueue.size() - 2) ==
           comm.buildWriteSinglePdu(2, 35));
    assert(comm.m_requestQueue.last() == comm.buildWriteSinglePdu(1, 1));

    comm.m_connected = true;
    comm.m_awaitingResponse = true; // 模拟等待响应，禁止真实串口写入
    assert(comm.electricalHz() == 27);
    comm.m_requestQueue.clear();
    comm.setThrottlePercent(40);
    comm.setThrottlePercent(70);
    assert(comm.m_requestQueue.size() == 1);
    assert(comm.m_requestQueue.first() == comm.buildWriteSinglePdu(2, 70));
    comm.pollStatus();
    comm.pollStatus();
    assert(comm.m_requestQueue.count(comm.buildReadPdu(0, 10)) == 1);

    comm.setThrottlePercent(0);
    assert(comm.m_requestQueue.size() == 1);
    assert(comm.m_requestQueue.first() == comm.buildWriteSinglePdu(1, 0));
    comm.m_requestQueue.append(comm.buildWriteSinglePdu(2, 90));
    comm.sendStop();
    assert(comm.m_requestQueue.size() == 1);
    assert(comm.m_requestQueue.first() == comm.buildWriteSinglePdu(1, 0));
    std::puts("PASS: startup target, live target coalescing, feedback, polling, stop priority");
    return 0;
}
