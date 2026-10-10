"""Drive the motor over Modbus-RTU directly, without the HostSoftware GUI.

The firmware faults with 0x0002 if no frame arrives for 1 s, so this script
keeps polling while the drive is active.

Usage:
    python tests/motor_serial_run.py [port] [throttle] [hold_s]
Defaults: COM5, 15 %, 8 s.
"""

import sys
import time

import serial

SLAVE = 1
REG_COUNT = 10

REG_NAMES = (
    "runState", "startReq", "throttle", "pwmHz", "duty",
    "fault", "elecHz", "fwVer", "commErr", "commOk",
)


def crc16(data):
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc


def build(pdu):
    frame = bytes([SLAVE]) + bytes(pdu)
    value = crc16(frame)
    return frame + bytes([value & 0xFF, value >> 8])


def read_registers(port):
    port.reset_input_buffer()
    port.write(build([0x03, 0x00, 0x00, 0x00, REG_COUNT]))
    raw = port.read(5 + REG_COUNT * 2)
    if len(raw) != 5 + REG_COUNT * 2:
        return None
    if raw[1] & 0x80:
        return None
    values = []
    for i in range(REG_COUNT):
        values.append((raw[3 + i * 2] << 8) | raw[4 + i * 2])
    return values


def write_register(port, address, value):
    port.reset_input_buffer()
    port.write(build([0x06, address >> 8, address & 0xFF, value >> 8, value & 0xFF]))
    raw = port.read(8)
    return len(raw) == 8 and raw[1] == 0x06


def main():
    port_name = sys.argv[1] if len(sys.argv) > 1 else "COM5"
    throttle = int(sys.argv[2]) if len(sys.argv) > 2 else 15
    hold = float(sys.argv[3]) if len(sys.argv) > 3 else 8.0

    ok = 0
    err = 0
    last = None
    started_at = time.time()

    with serial.Serial(port_name, 9600, timeout=0.3) as port:
        print(f"opened {port_name} 目标油门 {throttle}%  保持 {hold}s", flush=True)

        def poll(tag):
            nonlocal ok, err, last
            values = read_registers(port)
            if values is None:
                err += 1
                return None
            ok += 1
            last = values
            changed = values != poll.previous
            poll.previous = values
            if changed or tag:
                stamp = time.time() - started_at
                body = "  ".join(
                    f"{name}={value}" for name, value in zip(REG_NAMES, values)
                )
                print(f"[{stamp:5.2f}s] {tag}{body}", flush=True)
            return values

        poll.previous = None

        deadline = time.time() + 1.5
        while time.time() < deadline:
            poll("baseline  ")
            time.sleep(0.25)

        print(f"-> 写 0x0002 = {throttle} (油门)", flush=True)
        throttle_ok = False
        for _ in range(8):
            write_register(port, 0x0002, throttle)
            time.sleep(0.15)
            check = read_registers(port)
            if check is not None and check[2] == throttle:
                throttle_ok = True
                break
        print("   ok" if throttle_ok else "   FAILED (油门写不进去)", flush=True)
        if not throttle_ok:
            print("   放弃启动：零油门启动是空操作。", flush=True)
            return
        time.sleep(0.3)
        print("-> 写 0x0001 = 1 (启动)", flush=True)
        print("   ok" if write_register(port, 0x0001, 1) else "   FAILED")

        deadline = time.time() + hold
        while time.time() < deadline:
            poll("")
            time.sleep(0.25)

        print("-> 写 0x0001 = 0 (停车)，0x0002 = 0", flush=True)
        write_register(port, 0x0001, 0)
        write_register(port, 0x0002, 0)
        for _ in range(4):
            poll("settle    ")
            time.sleep(0.25)

    print(f"\n收尾：ok={ok} err={err}")
    if last is not None:
        print("最终寄存器：" + "  ".join(
            f"{name}={value}" for name, value in zip(REG_NAMES, last)
        ))
        print(f"最终故障码 = 0x{last[5]:04X}")


if __name__ == "__main__":
    main()
