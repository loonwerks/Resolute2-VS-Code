/* SysML v2 Domain Library for AADL:
 * references:
 * SAE AS-5506/3 AADL annex D
 * OMG SysML v2 */
 
package Behavior_Properties {

    // Subprogram_Call_Protocol: enumeration (HSER,LSER,ASER) => HSER 
    //    applies to (subprogram access);
  enum def Supported_Subprogram_Call_Protocols {
    enum HSER; 
    enum LSER; 
    enum ASER;
  }
  alias HSER for Supported_Subprogram_Call_Protocols::HSER;
  alias LSER for Supported_Subprogram_Call_Protocols::LSER;
  alias ASER for Supported_Subprogram_Call_Protocols::ASER;
  attribute def Subprogram_Call_Protocol :> Supported_Subprogram_Call_Protocols;
}
