// @ HAMR: --platform Microkit --sel4-output-dir ../hamr/microkit

//@ HAMR: --platform Microkit --verus-attribute-syntax --sel4-output-dir ../hamr/microkit_dev
// @ HAMR: --platform Microkit --verus-attribute-syntax --sel4-output-dir ../hamr/microkit_initial
package Platform {
  private import HAMR::*;
  private import SW::*;
  
  part def Proc :> Processor {
    attribute :>> Frame_Period = 1950 [ms];
    attribute :>> Clock_Period = 2 [ms];
    attribute :>> Max_Domain = 6;
  }
  
  part def ZCU102_Impl :> System {
    part proc : Proc;
    part seL4 : SW::seL4;
    
    allocation allo :  Deployment_Properties::Actual_Processor_Binding
      allocate seL4 to proc; // (reference (proc)) applies to seL4
  }

  part def ZCU102_Impl_MOCK :> ZCU102_Impl {
      part :>> seL4 : SW::seL4_MOCK;
  }
}
