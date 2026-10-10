#define AMX_API_C
#include "amx_api.h"
#include "hc_uart.h"

void Api_Init(void)
{
	amx_fifo_init(&fifo_in_uart, buffer_in_uart, PACKET_BUFFER_SIZE);
	amx_fifo_init(&fifo_out_uart, buffer_out_uart, PACKET_BUFFER_SIZE);
	
	Api_type_init();
}

void Api_type_init(void)
{
	api_handle_uart.type = API_TYPE_UART;
}

void Api_send_data(Amxlink_msg_t *msg, amx_fifo_t *fifox, Amxlink_t *dev)
{
	Amxlink_msg_make(msg, fifox);

	if(dev->type == API_TYPE_UART)
	{
		uint8_t data = 0;
		while(amx_fifo_count(fifox))
		{
			data = amx_fifo_read(fifox);
			Uart_SendDataPoll(M0P_UART1, data);
		}
	}
	else if(dev->type == API_TYPE_BLE)
	{

	}
}

void Api_Poll_Parse(void)
{
	Amxlink_msg_parse(&fifo_in_uart, &api_handle_uart);
}

void Api_handle_message(Amxlink_t *dev)
{
	if(dev->type == API_TYPE_UART)
	{
		if(dev->msg.msgid.maincmd == API_CMD_TEST)
		{
			Tset_cmd_receive_data_parse(&dev->msg, dev->msg.msgid.subcmd);
		}
	}
	else if(dev->type == API_TYPE_BLE)
	{
		if(dev->msg.msgid.maincmd == API_CMD_TEST)
		{
			Tset_cmd_receive_data_parse(&dev->msg, dev->msg.msgid.subcmd);
		}
	}
}

void Api_handle_checksum_error(Amxlink_t *dev)
{
	if(dev->type == API_TYPE_UART)
	{
	}
	else if(dev->type == API_TYPE_BLE)
	{
	}
}

// For test
/**
	void __make_msg_fb(Amxlink_msg_t *fb, Amxlink_msg_t *msg, u8 ack_flag)
	{
		fb->length = xx;
		fb->seq = xx;
		...
		fb->data[...] = xx;
	}
*/

void fb_test_msg_sub1(Amxlink_msg_t *msg)
{
	/**you can make the message by yourself:
	
		Amxlink_msg_t feedback;
		__make_msg_fb(&feedback, msg, flag);
		Api_send_out_data(feedback, &fifo_out_xxx, &api_handle_xxx);
	*/

	// feedback what receive
//	Api_send_data(msg, &fifo_out_ble, &api_handle_ble);
}

void fb_test_msg_sub2(Amxlink_msg_t *msg)
{
	/**you can make the message by yourself:
	
		Amxlink_msg_t feedback;
		__make_msg_fb(&feedback, msg, flag);
		Api_send_out_data(feedback, &fifo_out_xxx, &api_handle_xxx);
	*/

	// feedback what receive
	Api_send_data(msg, &fifo_out_uart, &api_handle_uart);
}

void Tset_cmd_receive_data_parse(Amxlink_msg_t *msg, uint8_t subcmd)
{
	switch(subcmd)
	{
	case API_CMD_TEST_SUBCMD1:
		fb_test_msg_sub1(msg);
		break;

	case API_CMD_TEST_SUBCMD2:
		fb_test_msg_sub2(msg);
		break;

	default:
		break;
	}
}

