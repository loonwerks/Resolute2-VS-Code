/* SysML v2 Domain Library for AADL:
 * references:
 * SAE AS-5506D AADL appendix A4
 * OMG SysML v2 */

/*standard*/ library package Communication_Properties {
  
  private import AADL_Project::*;
  
  private import SI::*;
  private import MeasurementReferences::*;
  private import Time::*;

  attribute def Data_Rate :> AADL::Property, Data_Rate_Units;

  attribute def Queue_Size :> AADL::Property, ScalarValues::Integer;

  enum def Supported_Timing_Protocols {
    enum Sampled;
    enum Immediate;
    enum Delayed;
  }
  alias Sampled for Supported_Timing_Protocols::Sampled;
  alias Immediate for Supported_Timing_Protocols::Immediate;
  alias Delayed for Supported_Timing_Protocols::Delayed;
  attribute def Timing :> AADL::Property, Supported_Timing_Protocols;

  enum def Supported_Transmission_Types { 
    enum Push;
    enum Pull;
  }
  alias Push for Supported_Transmission_Types::Push;
  alias Pull for Supported_Transmission_Types::Pull;	
  attribute def Transmission_Type :> AADL::Property, Supported_Transmission_Types;

  attribute def Transmission_Time :> AADL::Property {
    attribute Fixed : Time_Range;
    attribute PerByte : Time_Range;
  } 

  // Actual_Latency: Time_Range applies to (flow, connection, bus, virtual bus, device, processor, virtual processor, system, memory, feature); 
  attribute def Actual_Latency :> AADL::Property, Time_Range;

  // Latency: Time_Range applies to (flow, connection, bus, virtual bus, device, processor, virtual processor, system, memory, feature); 
  attribute def Latency :> AADL::Property, Time_Range;
}
