package SW {
  
  private import HAMR::*;
  private import SequenceFunctions::*;
  private import ControlFunctions::*;

  part def u16Array :> Array {
    part :>> Base_Type : Unsigned_16;
    attribute :>> Dimensions = 1;
    attribute :>> Data_Size = 2 [byte];
    attribute :>> Array_Size_Kind = Fixed;
  }

  part def RawEthernetMessage :> Array {
    part :>> Base_Type : Unsigned_8;
    attribute :>> Dimensions = 1600;
    attribute :>> Array_Size_Kind = Fixed; 
    attribute :>> Data_Size = 1600[byte];
  }

  part def EthIpUdpHeaders :> Array {
    part :>> Base_Type : Unsigned_8;
    attribute :>> Dimensions = 42;
    attribute :>> Data_Size = 42 [byte];
    attribute :>> Array_Size_Kind = Fixed;
  }
  
  part def UdpPayload :> Array {
    part :>> Base_Type : Unsigned_8;
    attribute :>> Dimensions = 1558;
    attribute :>> Data_Size = 1558 [byte];
    attribute :>> Array_Size_Kind = Fixed;
  }
  
  part def UdpFrame_Impl :> Struct {
    part headers : EthIpUdpHeaders;
    part payload : UdpPayload;
  }
  
  part def SizedEthernetMessage_Impl :> Struct {
    part amessage : RawEthernetMessage;
    part sz : Unsigned_16;
  }

  part def LowLevelEthernetDriver :> Thread {
    attribute :>> Dispatch_Protocol = Periodic;
    attribute :>> Period = 1000 [ms]; 
    attribute :>> Compute_Execution_Time = 300[ms] .. 300[ms];
    attribute :>> Implementation_Language = Rust;
    attribute :>> Stack_Size = 1048576[byte];

    port EthernetFramesRx0: EventDataPort {out :>> type : RawEthernetMessage; }
    port EthernetFramesRx1: EventDataPort {out :>> type : RawEthernetMessage; }
    port EthernetFramesRx2: EventDataPort {out :>> type : RawEthernetMessage; } 
    port EthernetFramesRx3: EventDataPort {out :>> type : RawEthernetMessage; }
    port EthernetFramesTx0: EventDataPort {in :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTx1: EventDataPort {in :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTx2: EventDataPort {in :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTx3: EventDataPort {in :>> type : SizedEthernetMessage_Impl; }
  }
  
  part def LowLevelEthernetDriver_seL4 :> Process {
    attribute :>> Domain = 4; 

    part LowLevelEthernetDriver : SW::LowLevelEthernetDriver; 

    port EthernetFramesRx0: EventDataPort {out :>> type : RawEthernetMessage; }
    port EthernetFramesRx1: EventDataPort {out :>> type : RawEthernetMessage; }
    port EthernetFramesRx2: EventDataPort {out :>> type : RawEthernetMessage; } 
    port EthernetFramesRx3: EventDataPort {out :>> type : RawEthernetMessage; }
    port EthernetFramesTx0: EventDataPort {in :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTx1: EventDataPort {in :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTx2: EventDataPort {in :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTx3: EventDataPort {in :>> type : SizedEthernetMessage_Impl; }

    connection c1 : PortConnection 
      connect EthernetFramesTx0 to LowLevelEthernetDriver.EthernetFramesTx0;
    connection c2 : PortConnection 
      connect EthernetFramesTx1 to LowLevelEthernetDriver.EthernetFramesTx1;
    connection c3 : PortConnection 
      connect EthernetFramesTx2 to LowLevelEthernetDriver.EthernetFramesTx2;
    connection c4 : PortConnection 
      connect EthernetFramesTx3 to LowLevelEthernetDriver.EthernetFramesTx3;
      
    connection c5 : PortConnection
      connect LowLevelEthernetDriver.EthernetFramesRx0 to EthernetFramesRx0;
    connection c6 : PortConnection
      connect LowLevelEthernetDriver.EthernetFramesRx1 to EthernetFramesRx1;
    connection c7 : PortConnection
      connect LowLevelEthernetDriver.EthernetFramesRx2 to EthernetFramesRx2;
    connection c8 : PortConnection
      connect LowLevelEthernetDriver.EthernetFramesRx3 to EthernetFramesRx3;
  }
  
  part def RxFirewall :> Thread {
    port EthernetFramesRxIn0: EventDataPort {in :>> type : RawEthernetMessage; }
    port EthernetFramesRxIn1: EventDataPort {in :>> type : RawEthernetMessage; }
    port EthernetFramesRxIn2: EventDataPort {in :>> type : RawEthernetMessage; } 
    port EthernetFramesRxIn3: EventDataPort {in :>> type : RawEthernetMessage; }
    port VmmOut0 : EventDataPort { out :>> type : RawEthernetMessage; }
    port VmmOut1 : EventDataPort { out :>> type : RawEthernetMessage; }
    port VmmOut2 : EventDataPort { out :>> type : RawEthernetMessage; }
    port VmmOut3 : EventDataPort { out :>> type : RawEthernetMessage; }
    port MavlinkOut0 : EventDataPort { out :>> type : UdpFrame_Impl; }
    port MavlinkOut1 : EventDataPort { out :>> type : UdpFrame_Impl; }
    port MavlinkOut2 : EventDataPort { out :>> type : UdpFrame_Impl; }
    port MavlinkOut3 : EventDataPort { out :>> type : UdpFrame_Impl; }

    attribute :>> Dispatch_Protocol = Periodic;
    attribute :>> Period = 1000[ms]; 
    attribute :>> Compute_Execution_Time =  300[ms] .. 300[ms];
    attribute :>> Stack_Size = 1048576[byte];
    attribute :>> Implementation_Language = Rust;			

    language "GUMBO" /*{

      compute

        guarantee hlr_05_rx0_can_send_arp_to_vmm "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=3":
          ((HasEvent(EthernetFramesRxIn0) and GumboLib::GUMBO__Library::valid_arp(EthernetFramesRxIn0)) implies
            (HasEvent(VmmOut0) and (EthernetFramesRxIn0 == VmmOut0) & NoSend(MavlinkOut0)));
        guarantee hlr_18_rx0_can_send_mavlink_udp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          ((HasEvent(EthernetFramesRxIn0) and GumboLib::GUMBO__Library::valid_ipv4_udp_mavlink(EthernetFramesRxIn0)) implies
            (HasEvent(MavlinkOut0) and GumboLib::GUMBO__Library::input_eq_mav_output(EthernetFramesRxIn0, MavlinkOut0) & NoSend(VmmOut0)));
        guarantee hlr_13_rx0_can_send_ipv4_udp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=3":
          ((HasEvent(EthernetFramesRxIn0) and GumboLib::GUMBO__Library::valid_ipv4_udp_port(EthernetFramesRxIn0)) implies
            (HasEvent(VmmOut0) and (EthernetFramesRxIn0 == VmmOut0) & NoSend(MavlinkOut0)));
        guarantee hlr_15_rx0_disallow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          (HasEvent(EthernetFramesRxIn0) and not GumboLib::GUMBO__Library::rx_allow_outbound_frame(EthernetFramesRxIn0)) implies
            (NoSend(VmmOut0) & NoSend(MavlinkOut0));
        guarantee hlr_17_rx0_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          (HasEvent(EthernetFramesRxIn0) | (NoSend(VmmOut0) & NoSend(MavlinkOut0)));

        guarantee hlr_05_rx1_can_send_arp_to_vmm "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=3":
          ((HasEvent(EthernetFramesRxIn1) and GumboLib::GUMBO__Library::valid_arp(EthernetFramesRxIn1)) implies
            (HasEvent(VmmOut1) and (EthernetFramesRxIn1 == VmmOut1) & NoSend(MavlinkOut1)));
        guarantee hlr_18_rx1_can_send_mavlink_udp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          ((HasEvent(EthernetFramesRxIn1) and GumboLib::GUMBO__Library::valid_ipv4_udp_mavlink(EthernetFramesRxIn1)) implies
            (HasEvent(MavlinkOut1) and GumboLib::GUMBO__Library::input_eq_mav_output(EthernetFramesRxIn1, MavlinkOut1) & NoSend(VmmOut1)));
        guarantee hlr_13_rx1_can_send_ipv4_udp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=3":
          ((HasEvent(EthernetFramesRxIn1) and GumboLib::GUMBO__Library::valid_ipv4_udp_port(EthernetFramesRxIn1)) implies
            (HasEvent(VmmOut1) and (EthernetFramesRxIn1 == VmmOut1) & NoSend(MavlinkOut1)));
        guarantee hlr_15_rx1_disallow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          (HasEvent(EthernetFramesRxIn1) and not GumboLib::GUMBO__Library::rx_allow_outbound_frame(EthernetFramesRxIn1)) implies
            (NoSend(VmmOut1) & NoSend(MavlinkOut1));
        guarantee hlr_17_rx1_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          (HasEvent(EthernetFramesRxIn1) | (NoSend(VmmOut1) & NoSend(MavlinkOut1)));

        guarantee hlr_05_rx2_can_send_arp_to_vmm "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=3":
          ((HasEvent(EthernetFramesRxIn2) and GumboLib::GUMBO__Library::valid_arp(EthernetFramesRxIn2)) implies
            (HasEvent(VmmOut2) and (EthernetFramesRxIn2 == VmmOut2) & NoSend(MavlinkOut2)));
        guarantee hlr_18_rx2_can_send_mavlink_udp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          ((HasEvent(EthernetFramesRxIn2) and GumboLib::GUMBO__Library::valid_ipv4_udp_mavlink(EthernetFramesRxIn2)) implies
            (HasEvent(MavlinkOut2) and GumboLib::GUMBO__Library::input_eq_mav_output(EthernetFramesRxIn2, MavlinkOut2) & NoSend(VmmOut2)));
        guarantee hlr_13_rx2_can_send_ipv4_udp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=3":
          ((HasEvent(EthernetFramesRxIn2) and GumboLib::GUMBO__Library::valid_ipv4_udp_port(EthernetFramesRxIn2)) implies
            (HasEvent(VmmOut2) and (EthernetFramesRxIn2 == VmmOut2) & NoSend(MavlinkOut2)));
        guarantee hlr_15_rx2_disallow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          (HasEvent(EthernetFramesRxIn2) and not GumboLib::GUMBO__Library::rx_allow_outbound_frame(EthernetFramesRxIn2)) implies
            (NoSend(VmmOut2) & NoSend(MavlinkOut2));
        guarantee hlr_17_rx2_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          (HasEvent(EthernetFramesRxIn2) | (NoSend(VmmOut2) & NoSend(MavlinkOut2)));

        guarantee hlr_05_rx3_can_send_arp_to_vmm "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=3":
          ((HasEvent(EthernetFramesRxIn3) and GumboLib::GUMBO__Library::valid_arp(EthernetFramesRxIn3)) implies
            (HasEvent(VmmOut3) and (EthernetFramesRxIn3 == VmmOut3) & NoSend(MavlinkOut3)));
        guarantee hlr_18_rx3_can_send_mavlink_udp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          ((HasEvent(EthernetFramesRxIn3) and GumboLib::GUMBO__Library::valid_ipv4_udp_mavlink(EthernetFramesRxIn3)) implies
            (HasEvent(MavlinkOut3) and GumboLib::GUMBO__Library::input_eq_mav_output(EthernetFramesRxIn3, MavlinkOut3) & NoSend(VmmOut3)));
        guarantee hlr_13_rx3_can_send_ipv4_udp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=3":
          ((HasEvent(EthernetFramesRxIn3) and GumboLib::GUMBO__Library::valid_ipv4_udp_port(EthernetFramesRxIn3)) implies
            (HasEvent(VmmOut3) and (EthernetFramesRxIn3 == VmmOut3) & NoSend(MavlinkOut3)));
        guarantee hlr_15_rx3_disallow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          (HasEvent(EthernetFramesRxIn3) and not GumboLib::GUMBO__Library::rx_allow_outbound_frame(EthernetFramesRxIn3)) implies
            (NoSend(VmmOut3) & NoSend(MavlinkOut3));
        guarantee hlr_17_rx3_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=4":
          (HasEvent(EthernetFramesRxIn3) | (NoSend(VmmOut3) & NoSend(MavlinkOut3)));
    }*/
  }
  
  part def RxFirewall_seL4 :> Process {
    port EthernetFramesRxIn0 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesRxIn1 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesRxIn2 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesRxIn3 : EventDataPort { in :>> type : RawEthernetMessage; }
    port VmmOut0 : EventDataPort { out :>> type : RawEthernetMessage; }
    port VmmOut1 : EventDataPort { out :>> type : RawEthernetMessage; }
    port VmmOut2 : EventDataPort { out :>> type : RawEthernetMessage; }
    port VmmOut3 : EventDataPort { out :>> type : RawEthernetMessage; }
    port MavlinkOut0 : EventDataPort { out :>> type : UdpFrame_Impl; }
    port MavlinkOut1 : EventDataPort { out :>> type : UdpFrame_Impl; }
    port MavlinkOut2 : EventDataPort { out :>> type : UdpFrame_Impl; }
    port MavlinkOut3 : EventDataPort { out :>> type : UdpFrame_Impl; }

    part RxFirewall : SW::RxFirewall;
    connection c1 : PortConnection 
      connect EthernetFramesRxIn0 to RxFirewall.EthernetFramesRxIn0;
    connection c2 : PortConnection 
      connect EthernetFramesRxIn1 to RxFirewall.EthernetFramesRxIn1;
    connection c3 : PortConnection 
      connect EthernetFramesRxIn2 to RxFirewall.EthernetFramesRxIn2;
    connection c4 : PortConnection 
      connect EthernetFramesRxIn3 to RxFirewall.EthernetFramesRxIn3;	
    connection c5 : PortConnection
      connect RxFirewall.VmmOut0 to VmmOut0;
    connection c6 : PortConnection
      connect RxFirewall.VmmOut1 to VmmOut1;
    connection c7 : PortConnection
      connect RxFirewall.VmmOut2 to VmmOut2;
    connection c8 : PortConnection
      connect RxFirewall.VmmOut3 to VmmOut3;
    connection c9 : PortConnection
      connect RxFirewall.MavlinkOut0 to MavlinkOut0;
    connection c10 : PortConnection
      connect RxFirewall.MavlinkOut1 to MavlinkOut1;
    connection c11 : PortConnection
      connect RxFirewall.MavlinkOut2 to MavlinkOut2;
    connection c12 : PortConnection
      connect RxFirewall.MavlinkOut3 to MavlinkOut3;
      
    attribute :>> Domain = 5;
  }
  
  part def TxFirewall :> Thread {
    port EthernetFramesTxIn0 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTxIn1 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTxIn2 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTxIn3 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTxOut0 : EventDataPort { out :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTxOut1 : EventDataPort { out :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTxOut2 : EventDataPort { out :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTxOut3 : EventDataPort { out :>> type : SizedEthernetMessage_Impl; }
  
    attribute :>> Dispatch_Protocol = Periodic;
    attribute :>> Period = 1000 [ms];
    attribute :>> Compute_Execution_Time = 300[ms] .. 300[ms];
    attribute :>> Stack_Size = 1048576[byte];
    attribute :>> Implementation_Language = Rust;
    
    language "GUMBO" /*{
         
      integration

        guarantee valid_tx_out_message_port0 "Only valid ARP and IPV4 size messages transmitted by TxFirewall Port 0":
          (GumboLib::GUMBO__Library::valid_arp(EthernetFramesTxOut0.amessage) & GumboLib::GUMBO__Library::valid_output_arp_size(EthernetFramesTxOut0))
          | (GumboLib::GUMBO__Library::valid_ipv4(EthernetFramesTxOut0.amessage) & GumboLib::GUMBO__Library::valid_output_ipv4_size(EthernetFramesTxOut0.amessage,EthernetFramesTxOut0));

        guarantee valid_tx_out_message_port1 "Only valid ARP and IPV4 size messages transmitted by TxFirewall Port 1":
          (GumboLib::GUMBO__Library::valid_arp(EthernetFramesTxOut1.amessage) & GumboLib::GUMBO__Library::valid_output_arp_size(EthernetFramesTxOut1))
          | (GumboLib::GUMBO__Library::valid_ipv4(EthernetFramesTxOut1.amessage) & GumboLib::GUMBO__Library::valid_output_ipv4_size(EthernetFramesTxOut1.amessage,EthernetFramesTxOut1));
        
        guarantee valid_tx_out_message_port2 "Only valid ARP and IPV4 size messages transmitted by TxFirewall Port 2":
          (GumboLib::GUMBO__Library::valid_arp(EthernetFramesTxOut2.amessage) & GumboLib::GUMBO__Library::valid_output_arp_size(EthernetFramesTxOut2))
          | (GumboLib::GUMBO__Library::valid_ipv4(EthernetFramesTxOut2.amessage) & GumboLib::GUMBO__Library::valid_output_ipv4_size(EthernetFramesTxOut2.amessage,EthernetFramesTxOut2));

        guarantee valid_tx_out_message_port3 "Only valid ARP and IPV4 size messages transmitted by TxFirewall Port 3":
          (GumboLib::GUMBO__Library::valid_arp(EthernetFramesTxOut3.amessage) & GumboLib::GUMBO__Library::valid_output_arp_size(EthernetFramesTxOut3))
          | (GumboLib::GUMBO__Library::valid_ipv4(EthernetFramesTxOut3.amessage) & GumboLib::GUMBO__Library::valid_output_ipv4_size(EthernetFramesTxOut3.amessage,EthernetFramesTxOut3));
          
      compute
  
        guarantee hlr_07_tx0_can_send_valid_arp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=5":
          ((HasEvent(EthernetFramesTxIn0) and GumboLib::GUMBO__Library::valid_arp(EthernetFramesTxIn0)) implies
            (HasEvent(EthernetFramesTxOut0) and (EthernetFramesTxIn0 == EthernetFramesTxOut0.amessage) and GumboLib::GUMBO__Library::valid_output_arp_size(EthernetFramesTxOut0)));
        guarantee hlr_12_tx0_can_send_valid_ipv4 "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=5":
          ((HasEvent(EthernetFramesTxIn0) and GumboLib::GUMBO__Library::valid_ipv4(EthernetFramesTxIn0)) implies
            (HasEvent(EthernetFramesTxOut0) and (EthernetFramesTxIn0 == EthernetFramesTxOut0.amessage) and GumboLib::GUMBO__Library::valid_output_ipv4_size(EthernetFramesTxIn0, EthernetFramesTxOut0) ));
        guarantee hlr_14_tx0_disallow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
         (HasEvent(EthernetFramesTxIn0) and not GumboLib::GUMBO__Library::tx_allow_outbound_frame(EthernetFramesTxIn0)) implies
           (NoSend(EthernetFramesTxOut0));
        guarantee hlr_16_tx0_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
           (HasEvent(EthernetFramesTxIn0) | NoSend(EthernetFramesTxOut0));
  
        guarantee hlr_07_tx1_can_send_valid_arp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=5":
          ((HasEvent(EthernetFramesTxIn1) and GumboLib::GUMBO__Library::valid_arp(EthernetFramesTxIn1)) implies
            (HasEvent(EthernetFramesTxOut1) and (EthernetFramesTxIn1 == EthernetFramesTxOut1.amessage) and GumboLib::GUMBO__Library::valid_output_arp_size(EthernetFramesTxOut1) ));
        guarantee hlr_12_tx1_can_send_valid_ipv4 "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=5":
          ((HasEvent(EthernetFramesTxIn1) and GumboLib::GUMBO__Library::valid_ipv4(EthernetFramesTxIn1)) implies
            (HasEvent(EthernetFramesTxOut1) and (EthernetFramesTxIn1 == EthernetFramesTxOut1.amessage) and GumboLib::GUMBO__Library::valid_output_ipv4_size(EthernetFramesTxIn1, EthernetFramesTxOut1) ));
        guarantee hlr_14_tx1_disallow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
         (HasEvent(EthernetFramesTxIn1) and not GumboLib::GUMBO__Library::tx_allow_outbound_frame(EthernetFramesTxIn1)) implies
           (NoSend(EthernetFramesTxOut1));
        guarantee hlr_16_tx1_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
           (HasEvent(EthernetFramesTxIn1) | NoSend(EthernetFramesTxOut1));
  
        guarantee hlr_07_tx2_can_send_valid_arp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=5":
          ((HasEvent(EthernetFramesTxIn2) and GumboLib::GUMBO__Library::valid_arp(EthernetFramesTxIn2)) implies
            (HasEvent(EthernetFramesTxOut2) and (EthernetFramesTxIn2 == EthernetFramesTxOut2.amessage) and GumboLib::GUMBO__Library::valid_output_arp_size(EthernetFramesTxOut2) ));
        guarantee hlr_12_tx2_can_send_valid_ipv4 "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=5":
          ((HasEvent(EthernetFramesTxIn2) and GumboLib::GUMBO__Library::valid_ipv4(EthernetFramesTxIn2)) implies
            (HasEvent(EthernetFramesTxOut2) and (EthernetFramesTxIn2 == EthernetFramesTxOut2.amessage) and GumboLib::GUMBO__Library::valid_output_ipv4_size(EthernetFramesTxIn2, EthernetFramesTxOut2) ));
        guarantee hlr_14_tx2_disallow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
          (HasEvent(EthernetFramesTxIn2) and not GumboLib::GUMBO__Library::tx_allow_outbound_frame(EthernetFramesTxIn2)) implies
            (NoSend(EthernetFramesTxOut2));
        guarantee hlr_16_tx2_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
          (HasEvent(EthernetFramesTxIn2) | NoSend(EthernetFramesTxOut2));
  
        guarantee hlr_07_tx3_can_send_valid_arp "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=5":
          ((HasEvent(EthernetFramesTxIn3) and GumboLib::GUMBO__Library::valid_arp(EthernetFramesTxIn3)) implies
            (HasEvent(EthernetFramesTxOut3) and (EthernetFramesTxIn3 == EthernetFramesTxOut3.amessage) and GumboLib::GUMBO__Library::valid_output_arp_size(EthernetFramesTxOut3) ));
        guarantee hlr_12_tx3_can_send_valid_ipv4 "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=5":
          ((HasEvent(EthernetFramesTxIn3) and GumboLib::GUMBO__Library::valid_ipv4(EthernetFramesTxIn3)) implies
            (HasEvent(EthernetFramesTxOut3) and (EthernetFramesTxIn3 == EthernetFramesTxOut3.amessage) and GumboLib::GUMBO__Library::valid_output_ipv4_size(EthernetFramesTxIn3, EthernetFramesTxOut3) ));
        guarantee hlr_14_tx3_disallow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
          (HasEvent(EthernetFramesTxIn3) and not GumboLib::GUMBO__Library::tx_allow_outbound_frame(EthernetFramesTxIn3)) implies
            (NoSend(EthernetFramesTxOut3));
        guarantee hlr_16_tx3_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
          (HasEvent(EthernetFramesTxIn3) | NoSend(EthernetFramesTxOut3));
                
    }*/
  }
  
  part def TxFirewall_seL4 :> Process {
    port EthernetFramesTxIn0 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTxIn1 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTxIn2 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTxIn3 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTxOut0 : EventDataPort { out :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTxOut1 : EventDataPort { out :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTxOut2 : EventDataPort { out :>> type : SizedEthernetMessage_Impl; }
    port EthernetFramesTxOut3 : EventDataPort { out :>> type : SizedEthernetMessage_Impl; }
  
    part TxFirewall : SW::TxFirewall;
    
    connection c1 : PortConnection 
      connect EthernetFramesTxIn0 to TxFirewall.EthernetFramesTxIn0;
    connection c2 : PortConnection 
      connect EthernetFramesTxIn1 to TxFirewall.EthernetFramesTxIn1;
    connection c3 : PortConnection 
      connect EthernetFramesTxIn2 to TxFirewall.EthernetFramesTxIn2;
    connection c4 : PortConnection 
      connect EthernetFramesTxIn3 to TxFirewall.EthernetFramesTxIn3;	
    connection c5 : PortConnection
      connect TxFirewall.EthernetFramesTxOut0 to EthernetFramesTxOut0;
    connection c6 : PortConnection
      connect TxFirewall.EthernetFramesTxOut1 to EthernetFramesTxOut1;
    connection c7 : PortConnection
      connect TxFirewall.EthernetFramesTxOut2 to EthernetFramesTxOut2;
    connection c8 : PortConnection
      connect TxFirewall.EthernetFramesTxOut3 to EthernetFramesTxOut3;
      
    attribute :>> Domain = 3;
  }
  
  part def MavlinkFirewall :> Thread {
    port In0 : EventDataPort { in :>> type : UdpFrame_Impl; }
    port In1 : EventDataPort { in :>> type : UdpFrame_Impl; }
    port In2 : EventDataPort { in :>> type : UdpFrame_Impl; }
    port In3 : EventDataPort { in :>> type : UdpFrame_Impl; }
    port Out0 : EventDataPort { out :>> type : RawEthernetMessage; }
    port Out1 : EventDataPort { out :>> type : RawEthernetMessage; }
    port Out2 : EventDataPort { out :>> type : RawEthernetMessage; }
    port Out3 : EventDataPort { out :>> type : RawEthernetMessage; }
    
    attribute :>> Dispatch_Protocol = Periodic;
    attribute :>> Period = 1000[ms]; 
    attribute :>> Compute_Execution_Time = 300 [ms] .. 300[ms];
    attribute :>> Stack_Size = 1048576[byte];
    attribute :>> Implementation_Language = Rust;

    language "GUMBO" /*{
      functions
        @spec def msg_is_wellformed(msg: UdpPayload): Base_Types::Boolean;

        @spec def msg_is_mav_cmd_flash_bootloader(msg: UdpPayload): Base_Types::Boolean;

        def msg_is_blacklisted(msg: UdpPayload): Base_Types::Boolean :=
          msg_is_mav_cmd_flash_bootloader(msg);

      compute
  
        guarantee hlr_19_mav0_drop_mav_cmd_flash_bootloader "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
          ((HasEvent(In0) and msg_is_wellformed(In0.payload) and msg_is_mav_cmd_flash_bootloader(In0.payload)) implies
            (NoSend(Out0)));
        guarantee hlr_20_mav0_drop_malformed_msg "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
          ((HasEvent(In0) and not msg_is_wellformed(In0.payload)) implies
            (NoSend(Out0)));
        guarantee hlr_21_mav0_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
           (HasEvent(In0) | NoSend(Out0));
        guarantee hlr_22_mav0_allow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
           (HasEvent(In0) and msg_is_wellformed(In0.payload) and not msg_is_blacklisted(In0.payload)) implies
             (HasEvent(Out0) and GumboLib::GUMBO__Library::mav_input_eq_output(In0, Out0));

        guarantee hlr_19_mav1_drop_mav_cmd_flash_bootloader "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
          ((HasEvent(In1) and msg_is_wellformed(In1.payload) and msg_is_mav_cmd_flash_bootloader(In1.payload)) implies
            (NoSend(Out1)));
        guarantee hlr_20_mav1_drop_malformed_msg "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
          ((HasEvent(In1) and not msg_is_wellformed(In1.payload)) implies
            (NoSend(Out1)));
        guarantee hlr_21_mav1_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
           (HasEvent(In1) | NoSend(Out1));
        guarantee hlr_22_mav1_allow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
           (HasEvent(In1) and msg_is_wellformed(In1.payload) and not msg_is_blacklisted(In1.payload)) implies
             (HasEvent(Out1) and GumboLib::GUMBO__Library::mav_input_eq_output(In1, Out1));

        guarantee hlr_19_mav2_drop_mav_cmd_flash_bootloader "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
          ((HasEvent(In2) and msg_is_wellformed(In2.payload) and msg_is_mav_cmd_flash_bootloader(In2.payload)) implies
            (NoSend(Out2)));
        guarantee hlr_20_mav2_drop_malformed_msg "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
          ((HasEvent(In2) and not msg_is_wellformed(In2.payload)) implies
            (NoSend(Out2)));
        guarantee hlr_21_mav2_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
           (HasEvent(In2) | NoSend(Out2));
        guarantee hlr_22_mav2_allow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
           (HasEvent(In2) and msg_is_wellformed(In2.payload) and not msg_is_blacklisted(In2.payload)) implies
             (HasEvent(Out2) and GumboLib::GUMBO__Library::mav_input_eq_output(In2, Out2));

        guarantee hlr_19_mav3_drop_mav_cmd_flash_bootloader "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=6":
          ((HasEvent(In3) and msg_is_wellformed(In3.payload) and msg_is_mav_cmd_flash_bootloader(In3.payload)) implies
            (NoSend(Out3)));
        guarantee hlr_20_mav3_drop_malformed_msg "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
          ((HasEvent(In3) and not msg_is_wellformed(In3.payload)) implies
            (NoSend(Out3)));
        guarantee hlr_21_mav3_no_input "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
           (HasEvent(In3) | NoSend(Out3));
        guarantee hlr_22_mav3_allow "https://loonwerks.com/INSPECTA-Open-Platform/ardupilot-basic/requirements/Inspecta-HLRs.pdf#page=7":
           (HasEvent(In3) and msg_is_wellformed(In3.payload) and not msg_is_blacklisted(In3.payload)) implies
             (HasEvent(Out3) and GumboLib::GUMBO__Library::mav_input_eq_output(In3, Out3));
    }*/			
  }
  
  part def MavlinkFirewall_seL4 :> Process {
    port In0 : EventDataPort { in :>> type : UdpFrame_Impl; }
    port In1 : EventDataPort { in :>> type : UdpFrame_Impl; }
    port In2 : EventDataPort { in :>> type : UdpFrame_Impl; }
    port In3 : EventDataPort { in :>> type : UdpFrame_Impl; }
    port Out0 : EventDataPort { out :>> type : RawEthernetMessage; }
    port Out1 : EventDataPort { out :>> type : RawEthernetMessage; }
    port Out2 : EventDataPort { out :>> type : RawEthernetMessage; }
    port Out3 : EventDataPort { out :>> type : RawEthernetMessage; }
    
    part MavlinkFirewall : SW::MavlinkFirewall;
    
    connection c1 : PortConnection
      connect In0 to MavlinkFirewall.In0;
    connection c2 : PortConnection
      connect In1 to MavlinkFirewall.In1;
    connection c3 : PortConnection
      connect In2 to MavlinkFirewall.In2;
    connection c4 : PortConnection
      connect In3 to MavlinkFirewall.In3;
    connection c5 : PortConnection
      connect MavlinkFirewall.Out0 to Out0;
    connection c6 : PortConnection
      connect MavlinkFirewall.Out1 to Out1;
    connection c7 : PortConnection
      connect MavlinkFirewall.Out2 to Out2;
    connection c8 : PortConnection
      connect MavlinkFirewall.Out3 to Out3;
      
    attribute :>> Domain = 6;
  }
  
  part def ArduPilot :> Thread {
    port FirewallRx0 : EventDataPort { in :>> type : RawEthernetMessage; }
    port FirewallRx1 : EventDataPort { in :>> type : RawEthernetMessage; }
    port FirewallRx2 : EventDataPort { in :>> type : RawEthernetMessage; }
    port FirewallRx3 : EventDataPort { in :>> type : RawEthernetMessage; }
    port MavlinkRx0 : EventDataPort { in :>> type : RawEthernetMessage; }
    port MavlinkRx1 : EventDataPort { in :>> type : RawEthernetMessage; }
    port MavlinkRx2 : EventDataPort { in :>> type : RawEthernetMessage; }
    port MavlinkRx3 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTx0 : EventDataPort { out :>> type : RawEthernetMessage; }
    port EthernetFramesTx1 : EventDataPort { out :>> type : RawEthernetMessage; }
    port EthernetFramesTx2 : EventDataPort { out :>> type : RawEthernetMessage; }
    port EthernetFramesTx3 : EventDataPort { out :>> type : RawEthernetMessage; }
  
    attribute :>> Dispatch_Protocol = Periodic;
    attribute :>> Period = 1000 [ms]; 
    attribute :>> Compute_Execution_Time = 600[ms] .. 600 [ms];
    attribute :>> Stack_Size = 1048576[byte];

    attribute :>> SMC = true;
  }

  part def ArduPilot_MOCK :> ArduPilot {
    attribute :>> SMC = false;
  }

  part def ArduPilot_seL4 :> Process {
    port FirewallRx0 : EventDataPort { in :>> type : RawEthernetMessage; }
    port FirewallRx1 : EventDataPort { in :>> type : RawEthernetMessage; }
    port FirewallRx2 : EventDataPort { in :>> type : RawEthernetMessage; }
    port FirewallRx3 : EventDataPort { in :>> type : RawEthernetMessage; }
    port MavlinkRx0 : EventDataPort { in :>> type : RawEthernetMessage; }
    port MavlinkRx1 : EventDataPort { in :>> type : RawEthernetMessage; }
    port MavlinkRx2 : EventDataPort { in :>> type : RawEthernetMessage; }
    port MavlinkRx3 : EventDataPort { in :>> type : RawEthernetMessage; }
    port EthernetFramesTx0 : EventDataPort { out :>> type : RawEthernetMessage; }
    port EthernetFramesTx1 : EventDataPort { out :>> type : RawEthernetMessage; }
    port EthernetFramesTx2 : EventDataPort { out :>> type : RawEthernetMessage; }
    port EthernetFramesTx3 : EventDataPort { out :>> type : RawEthernetMessage; }

    part ArduPilot : SW::ArduPilot;

    connection c1 : PortConnection 
      connect FirewallRx0 to ArduPilot.FirewallRx0;
    connection c2 : PortConnection 
      connect FirewallRx1 to ArduPilot.FirewallRx1;
    connection c3 : PortConnection 
      connect FirewallRx2 to ArduPilot.FirewallRx2;
    connection c4 : PortConnection 
      connect FirewallRx3 to ArduPilot.FirewallRx3;
    connection c5 : PortConnection
      connect MavlinkRx0 to ArduPilot.MavlinkRx0;
    connection c6 : PortConnection
      connect MavlinkRx1 to ArduPilot.MavlinkRx1;
    connection c7 : PortConnection
      connect MavlinkRx2 to ArduPilot.MavlinkRx2;
    connection c8 : PortConnection
      connect MavlinkRx3 to ArduPilot.MavlinkRx3;
    connection c9 : PortConnection
      connect ArduPilot.EthernetFramesTx0 to EthernetFramesTx0;
    connection c10 : PortConnection
      connect ArduPilot.EthernetFramesTx1 to EthernetFramesTx1;
    connection c11 : PortConnection
      connect ArduPilot.EthernetFramesTx2 to EthernetFramesTx2;
    connection c12 : PortConnection
      connect ArduPilot.EthernetFramesTx3 to EthernetFramesTx3;
      
    attribute :>> Domain = 2;
  }

  part def ArduPilot_seL4_MOCK :> ArduPilot_seL4 {
    part :>> ArduPilot : ArduPilot_MOCK;
  }

  part def seL4 :> System {
    part MavlinkFirewall : MavlinkFirewall_seL4;
    part RxFirewall : RxFirewall_seL4;
    part TxFirewall : TxFirewall_seL4;
    part LowLevelEthernetDriver : LowLevelEthernetDriver_seL4;
    part ArduPilot : ArduPilot_seL4;

    attribute Domain : CASE_Scheduling::Domain = 2;
    connection c1 : PortConnection
      connect LowLevelEthernetDriver.EthernetFramesRx0 to RxFirewall.EthernetFramesRxIn0;
    connection c2 : PortConnection
      connect LowLevelEthernetDriver.EthernetFramesRx1 to RxFirewall.EthernetFramesRxIn1;
    connection c3 : PortConnection
      connect LowLevelEthernetDriver.EthernetFramesRx2 to RxFirewall.EthernetFramesRxIn2;
    connection c4 : PortConnection
      connect LowLevelEthernetDriver.EthernetFramesRx3 to RxFirewall.EthernetFramesRxIn3;
    
    connection c5 : PortConnection
      connect RxFirewall.VmmOut0 to ArduPilot.FirewallRx0;
    connection c6 : PortConnection
      connect RxFirewall.VmmOut1 to ArduPilot.FirewallRx1;
    connection c7 : PortConnection
      connect RxFirewall.VmmOut2 to ArduPilot.FirewallRx2;
    connection c8 : PortConnection
      connect RxFirewall.VmmOut3 to ArduPilot.FirewallRx3;
      
    connection c9 : PortConnection
      connect RxFirewall.MavlinkOut0 to MavlinkFirewall.In0;
    connection c10 : PortConnection
      connect RxFirewall.MavlinkOut1 to MavlinkFirewall.In1;
    connection c11 : PortConnection
      connect RxFirewall.MavlinkOut2 to MavlinkFirewall.In2;
    connection c12 : PortConnection
      connect RxFirewall.MavlinkOut3 to MavlinkFirewall.In3;
    
    connection c13 : PortConnection
      connect MavlinkFirewall.Out0 to ArduPilot.MavlinkRx0;
    connection c14 : PortConnection
      connect MavlinkFirewall.Out1 to ArduPilot.MavlinkRx1;
    connection c15 : PortConnection
      connect MavlinkFirewall.Out2 to ArduPilot.MavlinkRx2;
    connection c16 : PortConnection
      connect MavlinkFirewall.Out3 to ArduPilot.MavlinkRx3;
    
    connection c17 : PortConnection
      connect ArduPilot.EthernetFramesTx0 to TxFirewall.EthernetFramesTxIn0;
    connection c18 : PortConnection
      connect ArduPilot.EthernetFramesTx1 to TxFirewall.EthernetFramesTxIn1;
    connection c19 : PortConnection
      connect ArduPilot.EthernetFramesTx2 to TxFirewall.EthernetFramesTxIn2;
    connection c20 : PortConnection
      connect ArduPilot.EthernetFramesTx3 to TxFirewall.EthernetFramesTxIn3;
    
    connection c21 : PortConnection
      connect TxFirewall.EthernetFramesTxOut0 to LowLevelEthernetDriver.EthernetFramesTx0;
    connection c22 : PortConnection
      connect TxFirewall.EthernetFramesTxOut1 to LowLevelEthernetDriver.EthernetFramesTx1;
    connection c23 : PortConnection
      connect TxFirewall.EthernetFramesTxOut2 to LowLevelEthernetDriver.EthernetFramesTx2;
    connection c24 : PortConnection
      connect TxFirewall.EthernetFramesTxOut3 to LowLevelEthernetDriver.EthernetFramesTx3;
  }

  part def seL4_MOCK :> seL4 {
    part :>> ArduPilot : ArduPilot_seL4_MOCK;
  }
}
