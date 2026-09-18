library package HAMR_ROS {

  attribute def RosNodeKind :> AADL::Property, RosNodeKinds;

  enum def RosNodeKinds { 
    ros2; 
    microRos;
  }

  attribute ros2: RosNodeKind = RosNodeKinds::ros2 as RosNodeKind;
  attribute microRos: RosNodeKind = RosNodeKinds::microRos as RosNodeKind;
}