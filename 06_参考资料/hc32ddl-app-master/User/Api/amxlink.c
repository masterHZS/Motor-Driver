#define AMXLINK_C
#include "amxlink.h"
#include "amx_api.h"

uint8_t Amxlink_msg_checksum(Amxlink_msg_t *msg)
{
	uint8_t checksum = 0;
	
	for(uint16_t i=0; i<msg->length; i++)
	{
		if(i ==0)
			checksum = (msg->data[i]);
		else
			checksum^= (msg->data[i]);
	}
	msg->checksum =  (checksum)^(msg->length)^(msg->seq)^(msg->sysid)^(msg->compid)^(msg->msgid.cmd);
	
	return msg->checksum;
}

void Amxlink_msg_make(Amxlink_msg_t *msg, amx_fifo_t *fifox)
{
	amx_fifo_write(fifox, AMXLINK_STX1);
	amx_fifo_write(fifox, AMXLINK_STX2);
	amx_fifo_write(fifox, msg->length);
	amx_fifo_write(fifox, msg->seq);
	amx_fifo_write(fifox, msg->sysid);
	amx_fifo_write(fifox, msg->compid);
	amx_fifo_write(fifox, msg->msgid.cmd);

	for(uint16_t idx=0; idx<msg->length; idx++)
	{
		amx_fifo_write(fifox, msg->data[idx]);
	}
	amx_fifo_write(fifox, Amxlink_msg_checksum(msg));
}

void Amxlink_msg_parse(amx_fifo_t *fifo, Amxlink_t *dev)
{
	uint8_t data, checksum;

	while(amx_fifo_count(fifo))
	{
		data = amx_fifo_read(fifo);
		switch(dev->state)
		{
		case AMXLINK_PARSE_STATE_STX1:
			if(data!=AMXLINK_STX1) dev->state = AMXLINK_PARSE_STATE_STX1;
			else dev->state++;
			break;
			
		case AMXLINK_PARSE_STATE_STX2:
			if(data!=AMXLINK_STX2) dev->state = AMXLINK_PARSE_STATE_STX1;
			else dev->state++;
			break;

		case AMXLINK_PARSE_STATE_LEN:
			dev->msg.length = data;
			dev->state++;
			break;

		case AMXLINK_PARSE_STATE_SEQ:
			dev->msg.seq = data;
			dev->state++;
			break;
			
		case AMXLINK_PARSE_STATE_SYSID:
			dev->msg.sysid = data;
			dev->state++;
			break;

		case AMXLINK_PARSE_STATE_COMPID:
			dev->msg.compid = data;
			dev->state++;
			break;

		case AMXLINK_PARSE_STATE_MSGCMD:
			dev->msg.msgid.cmd = data;
			dev->state++;
			dev->index = 0;
			if(dev->msg.length == 0) dev->state = AMXLINK_PARSE_STATE_CHECKSUM;
			break;

		case AMXLINK_PARSE_STATE_PAYLOAD:
			if(dev->index != dev->msg.length)
				dev->msg.data[dev->index++] = data;
			if(dev->index == dev->msg.length)
				dev->state = AMXLINK_PARSE_STATE_CHECKSUM;
			break;

		case AMXLINK_PARSE_STATE_CHECKSUM:
			dev->state = AMXLINK_PARSE_STATE_STX1;
			checksum = data;

			if(checksum == Amxlink_msg_checksum(&dev->msg))
			{
				// add your api function
				Api_handle_message(dev);
			}
			else 
			{
				// add your api function
				Api_handle_checksum_error(dev);
			}
		}
	}
}
