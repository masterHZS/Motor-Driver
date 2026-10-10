#ifndef __AMXLINK_H
#define __AMXLINK_H

#include "common.h"
#include "amx_fifo.h"

#ifdef AMXLINK_C
#define AMXLINK_EXT
#else
#define AMXLINK_EXT extern
#endif

/*
 *	Data format: STX(2)->LEN(1)->SEQ(1)->ID0(1)->ID1(1)->MSG(1)->PAYLOAD(0-255)->CHECKSUM(1)
 *	Checksum	 :	XOR(LEN, SEQ, [ID], MSG, PAYLOAD)
 */
#define AMXLINK_MAX_PAYLOAD_LEN 			255  ///< Maximum payload length
#define AMXLINK_NUM_HEADER_BYTES 			7 	 ///< Length of all header bytes
#define AMXLINK_NUM_CHECKSUM_BYTES 		1		 ///< Length of checksum
#define AMXLINK_NUM_NON_PAYLOAD_BYTES (AMXLINK_NUM_HEADER_BYTES + AMXLINK_NUM_CHECKSUM_BYTES)
#define AMXLINK_MAX_PACKET_LEN 				(AMXLINK_MAX_PAYLOAD_LEN + AMXLINK_NUM_NON_PAYLOAD_BYTES) ///< Maximum packet length

#define AMXLINK_STX1									0xAA
#define AMXLINK_STX2									0xF2


typedef enum 
{
	AMXLINK_PARSE_STATE_STX1,
	AMXLINK_PARSE_STATE_STX2,	
	AMXLINK_PARSE_STATE_LEN,
	AMXLINK_PARSE_STATE_SEQ,
	AMXLINK_PARSE_STATE_SYSID,
	AMXLINK_PARSE_STATE_COMPID,
	AMXLINK_PARSE_STATE_MSGCMD,
	AMXLINK_PARSE_STATE_PAYLOAD,
	AMXLINK_PARSE_STATE_CHECKSUM
}Amxlink_parse_state_t;


#if defined(__CC_ARM)
#pragma anon_unions
#elif defined(__ICCARM__)
#endif

typedef struct 
{
	uint8_t length;
	uint8_t seq;
	uint8_t sysid;
	uint8_t compid;
	union {
		uint8_t cmd;
		struct {
			uint8_t subcmd: 4;	// low bits
			uint8_t maincmd: 4;	// high bits
		};
	}msgid;
	uint8_t data[AMXLINK_MAX_PAYLOAD_LEN];
	uint8_t checksum;
}Amxlink_msg_t;

typedef struct 
{
	Amxlink_msg_t msg;
	Amxlink_parse_state_t state;
	uint8_t type;
	uint16_t index;
}Amxlink_t;

AMXLINK_EXT uint8_t Amxlink_msg_checksum(Amxlink_msg_t *msg);
AMXLINK_EXT void Amxlink_msg_make(Amxlink_msg_t *msg, amx_fifo_t *fifox);
AMXLINK_EXT void Amxlink_msg_parse(amx_fifo_t *fifo, Amxlink_t *dev);

#endif /* __AMXLINK_H */

