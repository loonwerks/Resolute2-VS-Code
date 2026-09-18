library package HAMR {

  public import HAMR_Time_Units::*;
  public import HAMR_Microkit::*;
  public import HAMR_ROS::*;
  public import HAMR_AADL::*;
  public import AADL::*;
  public import Base_Types::*;

  attribute def Array_Size_Kind :> AADL::Property, Array_Size_Kinds {
    doc AADL_Doc 
    /* 
     * Specifies the kind of array size semantics for an array data type.
     * 
     * Fixed: The array always has exactly the number of elements specified in
     *   the Data_Model::Dimension property. Both memory allocation and logical
     *   content size are fixed.
     *
     * Bounded: The array may contain fewer elements than specified by
     *   Data_Model::Dimension, but never more. The full size may be allocated in
     *   memory, but only part of it is considered logically valid.
     *
     * Unbounded: The array does not have a statically known size limit.
     *   If Data_Model::Dimension is provided then all dimensions must be equal to 0. 
     *   The array may grow arbitrarily, and size checks must be enforced at runtime.
     */
  }

  enum def Array_Size_Kinds {
    enum Fixed;
    enum Bound;
    enum Unbounded;
  }

  //alias Fixed for Array_Size_Kinds::Fixed;
  //alias Bound for Array_Size_Kinds::Bound;
  //alias Unbounded for Array_Size_Kinds::Unbounded;

  attribute Fixed: Array_Size_Kind = Array_Size_Kinds::Fixed as Array_Size_Kind;
  attribute Bound: Array_Size_Kind = Array_Size_Kinds::Bound as Array_Size_Kind;
  attribute Unbounded: Array_Size_Kind = Array_Size_Kinds::Unbounded as Array_Size_Kind;

  attribute def Implementation_Language :> AADL::Property, Implementation_Languages;
  
  enum def Implementation_Languages :> AADL::Property {
    enum Slang;
    enum C;
    enum Rust;
  }

  // alias Slang for Implementation_Languages::Slang;
  // alias C for Implementation_Languages::C;
  // alias Rust for Implementation_Languages::Rust;

  attribute Slang: Implementation_Language = Implementation_Languages::Slang as Implementation_Language;
  attribute C: Implementation_Language = Implementation_Languages::C as Implementation_Language;
  attribute Rust: Implementation_Language = Implementation_Languages::Rust as Implementation_Language;
}
