# XHSC HC32F005 DDL Rev2.0.0

Source (official product page, “驱动库及样例”):

- Page: https://www.xhsc.com.cn/product/1270.html
- Archive: https://oss-nc-beijing-2.cecloudcs.com/doc-hc/HC32F005_DDL_Rev2.0.0.zip

The official archive has been extracted once into
`HC32F005_DDL_Rev2.0.0/HC32F005_DDL_Rev2.0.0/`.  The zip archive is no longer
kept in the project to avoid duplicating the library.

The main firmware build script `../../build_comms.ps1` includes the official
`driver/inc`, `driver/src` and `mcu/common` files from this tree.  The local
`user/` layer contains only the motor, monitor and Modbus application logic.
