library package HAMR_Microkit {

  attribute def Passive :> AADL::Property, ScalarValues::Boolean;
  attribute def SMC :> AADL::Property, ScalarValues::Boolean;

  attribute def Scheduling :> AADL::Property, Scheduling_Type;

  enum def Scheduling_Type :> AADL::Property {
    enum Domain_Scheduling;
    enum MCS;
  }

  attribute Domain_Scheduling: Scheduling = Scheduling_Type::Domain_Scheduling as Scheduling;
  attribute MCS: Scheduling = Scheduling_Type::MCS as Scheduling;
}
