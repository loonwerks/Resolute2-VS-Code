package GumboLib {
  private import HAMR::*;

  language "GUMBO" /*{
    library

    functions
      def TCP_ALLOWED_PORTS(): SW::u16Array := SW::u16Array(5760[u16]);

      def UDP_ALLOWED_PORTS(): SW::u16Array := SW::u16Array(68[u16]);

      def two_bytes_to_u16_le(byte0: Base_Types::Unsigned_8, byte1: Base_Types::Unsigned_8): Base_Types::Unsigned_16 :=
        byte1.toU16 * 256[u16] + byte0.toU16;

      def two_bytes_to_u16_be(byte0: Base_Types::Unsigned_8, byte1: Base_Types::Unsigned_8): Base_Types::Unsigned_16 :=
        byte0.toU16 * 256[u16] + byte1.toU16;

      def three_bytes_to_u32(byte0: Base_Types::Unsigned_8, byte1: Base_Types::Unsigned_8, byte2: Base_Types::Unsigned_8): Base_Types::Unsigned_32 :=
        byte2.toU32 * 65536[u32] + byte1.toU32 * 256[u32] + byte0.toU32;

      def frame_is_wellformed_eth2(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        valid_frame_ethertype(aframe) & valid_frame_dst_addr(aframe);

      def valid_frame_ethertype(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        frame_has_ipv4(aframe) | frame_has_arp(aframe) | frame_has_ipv6(aframe);

      def valid_frame_dst_addr(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        ( not ((aframe#(0) == 0[u8]) &
        (aframe#(1) == 0[u8]) &
        (aframe#(2) == 0[u8]) &
        (aframe#(3) == 0[u8]) &
        (aframe#(4) == 0[u8]) &
        (aframe#(5) == 0[u8])));

      def frame_has_ipv4(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (aframe#(12) == 8[u8] & aframe#(13) == 0[u8]);

      def frame_has_ipv6(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (aframe#(12) == 134[u8] & aframe#(13) == 221[u8]);

      def frame_has_arp(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (aframe#(12) == 8[u8] & aframe#(13) == 6[u8]);

      def arp_has_ipv4(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (aframe#(16) == 8[u8] & aframe#(17) == 0[u8]);

      def arp_has_ipv6(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (aframe#(16) == 134[u8] & aframe#(17) == 221[u8]);

      def valid_arp_ptype(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        arp_has_ipv4(aframe) | arp_has_ipv6(aframe);

      def valid_arp_op(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (aframe#(20) == 0[u8] & (aframe#(21) == 1[u8] | aframe#(21) == 2[u8]));

      def valid_arp_htype(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (aframe#(14) == 0[u8] & aframe#(15) == 1[u8]);

      def wellformed_arp_frame(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        valid_arp_op(aframe) & valid_arp_htype(aframe) & valid_arp_ptype(aframe);

      def valid_ipv4_length(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (two_bytes_to_u16_be(aframe#(16), aframe#(17)) <= 9000[u16]);

      def valid_ipv4_protocol(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (
          (aframe#(23) == 0[u8])  |
          (aframe#(23) == 1[u8])  |
          (aframe#(23) == 2[u8])  |
          (aframe#(23) == 6[u8])  |
          (aframe#(23) == 17[u8]) |
          (aframe#(23) == 43[u8]) |
          (aframe#(23) == 44[u8]) |
          (aframe#(23) == 58[u8]) |
          (aframe#(23) == 59[u8]) |
          (aframe#(23) == 60[u8])
        );

      def valid_ipv4_vers_ihl(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        (aframe#(14) == 69[u8]);

      def wellformed_ipv4_frame(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        valid_ipv4_protocol(aframe) & valid_ipv4_length(aframe) & valid_ipv4_vers_ihl(aframe);

      // TxFirewall

      def valid_ipv6(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        frame_is_wellformed_eth2(aframe) & frame_has_ipv6(aframe);

      def valid_arp(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        frame_is_wellformed_eth2(aframe) & frame_has_arp(aframe) & wellformed_arp_frame(aframe);

      def valid_ipv4(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        frame_is_wellformed_eth2(aframe) & frame_has_ipv4(aframe) & wellformed_ipv4_frame(aframe);

      def ipv4_length(aframe: SW::RawEthernetMessage): Base_Types::Unsigned_16 :=
        two_bytes_to_u16_le(aframe#(16),aframe#(17));

      def valid_output_arp_size(output: SW::SizedEthernetMessage_Impl): Base_Types::Boolean :=
        output.sz == 64[u16];

      def valid_output_ipv4_size(input: SW::RawEthernetMessage, output: SW::SizedEthernetMessage_Impl): Base_Types::Boolean :=
        //output.sz == (ipv4_length(input)+14[u16]);
        (size(input) == 1600) and (output.sz == (two_bytes_to_u16_be(input#(16),input#(17))+14[u16]));

      def tx_allow_outbound_frame(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        valid_arp(aframe) | valid_ipv4(aframe);

      // RxFirewall

      def ipv4_is_tcp(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and (aframe#(23) == 6[u8]);

      def ipv4_is_udp(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and (aframe#(23) == 17[u8]);

      def tcp_is_valid_port(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and (two_bytes_to_u16_be(aframe#(36),aframe#(37)) == TCP_ALLOWED_PORTS()#(0));

      def udp_is_valid_port(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and (two_bytes_to_u16_be(aframe#(36),aframe#(37)) == UDP_ALLOWED_PORTS()#(0));

      def udp_is_mavlink_src_port(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and (two_bytes_to_u16_be(aframe#(34),aframe#(35)) == 14550[u16]);

      def udp_is_mavlink_dst_port(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and (two_bytes_to_u16_be(aframe#(36), aframe#(37)) == 14562[u16]);

      def udp_is_mavlink(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        udp_is_mavlink_src_port(aframe) & udp_is_mavlink_dst_port(aframe);

      def frame_has_ipv4_tcp_on_allowed_port_quant(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        ((0 .. (size(TCP_ALLOWED_PORTS()) - 1))
          -> exists {in i; TCP_ALLOWED_PORTS()#(i) == two_bytes_to_u16_be(aframe#(36), aframe#(37))});

      def udp_is_valid_direct_dst_port(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and
        ((0 .. (size(UDP_ALLOWED_PORTS()) - 1))
          -> exists {in i; UDP_ALLOWED_PORTS()#(i) == two_bytes_to_u16_be(aframe#(36), aframe#(37))});

      def valid_ipv4_tcp(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        frame_is_wellformed_eth2(aframe) & frame_has_ipv4(aframe) & wellformed_ipv4_frame(aframe) & ipv4_is_tcp(aframe);

      def valid_ipv4_udp(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        frame_is_wellformed_eth2(aframe) & frame_has_ipv4(aframe) & wellformed_ipv4_frame(aframe) & ipv4_is_udp(aframe);

      def valid_ipv4_tcp_port(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        valid_ipv4_tcp(aframe) & frame_has_ipv4_tcp_on_allowed_port_quant(aframe);

      def valid_ipv4_udp_port(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        valid_ipv4_udp(aframe) & udp_is_valid_direct_dst_port(aframe) & not udp_is_mavlink(aframe);

      def valid_ipv4_udp_mavlink(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        valid_ipv4_udp(aframe) & udp_is_mavlink(aframe);

      def rx_allow_outbound_frame(aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        valid_arp(aframe)
        | valid_ipv4_udp_mavlink(aframe)
        | valid_ipv4_udp_port(aframe);

      def input_eq_mav_output_headers(aframe: SW::RawEthernetMessage, headers: SW::EthIpUdpHeaders): Base_Types::Boolean :=
        size(aframe) == 1600 and
        ((0 .. (size(headers) - 1)) -> forAll {in i; headers#(i) == aframe#(i)});

      def input_eq_mav_output_payload(aframe: SW::RawEthernetMessage, payload: SW::UdpPayload, headers: SW::EthIpUdpHeaders): Base_Types::Boolean :=
        (size(aframe) == 1600 & size(payload) == 1558) and
        ((0 .. (size(payload)- 1)) -> forAll {in i; aframe#(i + size(headers)) == payload#(i)});

      def input_eq_mav_output(aframe: SW::RawEthernetMessage, output: SW::UdpFrame_Impl): Base_Types::Boolean :=
        input_eq_mav_output_headers(aframe, output.headers) & input_eq_mav_output_payload(aframe, output.payload, output.headers);

      // MavlinkFirewall

      def mav_input_headers_eq_output(headers: SW::EthIpUdpHeaders, aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        size(aframe) == 1600 and (0 .. (size(headers) - 1)) -> forAll{in i; headers#(i) == aframe#(i)};

      def mav_input_payload_eq_output(payload: SW::UdpPayload, headers: SW::EthIpUdpHeaders, aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        (size(aframe) == 1600 & size(payload) == 1558) and (0 .. (size(payload) - 1)) -> forAll{in i; aframe#(i + size(headers)) == payload#(i)};

      def mav_input_eq_output(input: SW::UdpFrame_Impl, aframe: SW::RawEthernetMessage): Base_Types::Boolean :=
        mav_input_headers_eq_output(input.headers, aframe) & mav_input_payload_eq_output(input.payload, input.headers, aframe);

  }*/
}
