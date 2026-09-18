/* SysML v2 Domain Library for AADL:
 * references:
 * SAE AS-5506D AADL appendix A1
 * OMG SysML v2 */

 /*standard*/ library package Deployment_Properties {

  private import AADL_Project::*;

  allocation def Actual_Processor_Binding {
    end part sw : AADL::Component;
    end part hw : AADL::Component;
  }

  allocation def Actual_Memory_Binding {
    end part sw : AADL::Component;
    end part hw : AADL::Component;
  }

  allocation def Actual_Connection_Binding {
    end part cnx : AADL::Component;
    end part bus : AADL::Component;
  }

  enum def Supported_Memory_Protocols :> AADL::Property {
    enum Execute_Only; 
    enum Read_Only; 
    enum Write_Only; 
    enum Read_Write;
  }
  alias Execute_Only for Supported_Memory_Protocols::Execute_Only;
  alias Read_Only for Supported_Memory_Protocols::Read_Only;
  alias Write_Only for Supported_Memory_Protocols::Write_Only;
  alias Read_Write for Supported_Memory_Protocols::Read_Write;
  attribute def Memory_Protocol :> AADL::Property, Supported_Memory_Protocols;
    
  // Runtime_Protection_Support: aadlboolean applies to (processor, virtual processor);
  attribute def Runtime_Protection_Support :> AADL::Property, ScalarValues::Boolean;

  // Scheduling_Protocol: inherit list of Supported_Scheduling_Protocols 
  //    applies to (virtual processor, processor, system);
  attribute def Scheduling_Protocol :> AADL::Property, Supported_Scheduling_Protocols;

  // Preemptive_Scheduler: aadlboolean applies to (processor);
  attribute def Preemptive_Scheduler :> AADL::Property, ScalarValues::Boolean; 

  // Thread_Limit: aadlinteger 0 .. Max_Thread_Limit applies to (processor, virtual processor);
  attribute def Thread_Limit :> AADL::Property, ScalarValues::Positive;
}
