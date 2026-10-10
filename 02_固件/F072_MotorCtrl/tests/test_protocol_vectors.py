#!/usr/bin/env python3
"""Check the host protocol examples against the Modbus CRC used by the MCU."""

VECTORS = {
    "read_status": "01030000000AC5CD",
    "start": "01060001000119CA",
    "stop": "010600010000D80A",
    "throttle_50": "010600020032A9DF",
    "throttle_80": "0106000200502836",
    "pwm_5k": "010600031388749C",
}


def crc16_modbus(data: bytes) -> int:
    crc = 0xFFFF
    for value in data:
        crc ^= value
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def main() -> None:
    for name, hex_frame in VECTORS.items():
        frame = bytes.fromhex(hex_frame)
        expected = frame[-2] | (frame[-1] << 8)
        actual = crc16_modbus(frame[:-2])
        assert actual == expected, (name, hex(actual), hex(expected))
        print(f"{name}: OK")
    print("all protocol vectors passed")


if __name__ == "__main__":
    main()
