#ifndef __AMX_API_H
#define __AMX_API_H

#include "common.h"
#include "amx_fifo.h"
#include "amxlink.h"

#ifdef AMX_API_C
#define AMX_API_EXT
#else
#define AMX_API_EXT extern
#endif

#define PACKET_BUFFER_SIZE			(AMXLINK_MAX_PACKET_LEN)

#define ACK_OK     							1
#define ACK_ERROR    						0

// For test cmd
#define API_CMD_TEST						0x0F
#define API_CMD_TEST_SUBCMD1		0x01
#define API_CMD_TEST_SUBCMD2		0x02


typedef enum 
{
	API_TYPE_UART,
	API_TYPE_BLE,
	API_TYPE_WIFI
}Api_type_t;

AMX_API_EXT Amxlink_t api_handle_uart;

AMX_API_EXT uint8_t buffer_in_uart[PACKET_BUFFER_SIZE];
AMX_API_EXT uint8_t buffer_out_uart[PACKET_BUFFER_SIZE];

AMX_API_EXT amx_fifo_t fifo_in_uart;
AMX_API_EXT amx_fifo_t fifo_out_uart;


AMX_API_EXT void Api_Init(void);
AMX_API_EXT void Api_type_init(void);
AMX_API_EXT void Api_send_data(Amxlink_msg_t *msg, amx_fifo_t *fifox, Amxlink_t *dev);
AMX_API_EXT void Api_Poll_Parse(void);
AMX_API_EXT void Api_handle_message(Amxlink_t *dev);
AMX_API_EXT void Api_handle_checksum_error(Amxlink_t *dev);

// For test
AMX_API_EXT void Tset_cmd_receive_data_parse(Amxlink_msg_t *msg, uint8_t subcmd);

#endif /* __AMX_API_H */

