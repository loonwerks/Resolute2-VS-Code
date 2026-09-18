grammar Resolute2

entry Model:
    definitions+=Definition*;

Definition:
    ConstantDefinition | FunctionDefinition;

ConstantDefinition:
    name=ID ':' type=TypeRef '=' value=Expression;

FunctionDefinition:
    kind=ClaimKind? name=ID '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')' body=DefinitionBody;

ClaimKind returns string:
    'goal' | 'strategy';

DefinitionBody:
    FunctionBody | ClaimBody;

FunctionBody:
    ':' returnType=TypeRef '=' expression=Expression;

ClaimBody:
    '<=' '**' text+=ClaimText+ '**' attributes+=ClaimAttribute* expression=Expression;

ClaimText:
    StringClaimText | ReferenceClaimText;

StringClaimText:
    value=STRING;

ReferenceClaimText:
    reference=[NamedElement:QualifiedName];

ClaimAttribute:
    ContextAttribute | JustificationAttribute | AssumptionAttribute | StrategyAttribute;

ContextAttribute:
    'context' name=ID? ':' value=Expression ';';

JustificationAttribute:
    'justification' name=ID? ':' value=STRING ';';

AssumptionAttribute:
    'assumption' name=ID? ':' value=Expression ';';

StrategyAttribute:
    'strategy' name=ID? ':' value=STRING ';';

Parameter:
    name=ID ':' declared=TypeOrDomain;

TypeOrDomain:
    CollectionType | LibraryType | BaseType | DomainReference;

DomainReference:
    reference=[NamedElement:QualifiedName];

TypeRef:
    CollectionType | LibraryType | BaseType;

CollectionType:
    ListType | SetType;

ListType:
    '[' elementType=TypeRef ']';

SetType:
    '{' elementType=TypeRef '}';

LibraryType:
    library=ID '.' name=ID;

BaseType:
    name=BaseTypeName ('<' parameter=TypeRef '>')?;

BaseTypeName returns string:
    'int' | 'real' | 'string' | 'bool' | 'range' | 'aadl' | 'component'
    | 'abstract' | 'bus' | 'data' | 'device' | 'memory' | 'processor'
    | 'process' | 'subprogram_group' | 'subprogram' | 'system'
    | 'thread_group' | 'thread' | 'virtual_bus' | 'virtual_processor'
    | 'connection' | 'property' | 'record' | 'feature' | 'port'
    | 'data_port' | 'event_port' | 'event_data_port' | 'feature_group'
    | 'access' | 'bus_access' | 'provides_bus_access' | 'requires_bus_access'
    | 'data_access' | 'provides_data_access' | 'requires_data_access'
    | 'subprogram_access' | 'provides_subprogram_access'
    | 'requires_subprogram_access' | 'subprogram_group_access'
    | 'provides_subprogram_group_access' | 'requires_subprogram_group_access'
    | 'flow_specification' | 'end_to_end_flow';

Expression:
    ImpliesExpression;

ImpliesExpression infers Expression:
    OrExpression ({infer BinaryExpression.left=current} operator='=>' right=ImpliesExpression)?;

OrExpression infers Expression:
    AndExpression ({infer BinaryExpression.left=current} operator=('or' | 'orelse') right=AndExpression)*;

AndExpression infers Expression:
    InstanceOfExpression ({infer BinaryExpression.left=current} operator=('and' | 'andthen') right=InstanceOfExpression)*;

InstanceOfExpression infers Expression:
    RelationalExpression ({infer InstanceOfExpression.expression=current} 'instanceof' type=BaseType)?;

RelationalExpression infers Expression:
    AdditiveExpression ({infer BinaryExpression.left=current} operator=('<' | '<=' | '>' | '>=' | '=' | '<>') right=AdditiveExpression)?;

AdditiveExpression infers Expression:
    MultiplicativeExpression ({infer BinaryExpression.left=current} operator=('+' | '-') right=MultiplicativeExpression)*;

MultiplicativeExpression infers Expression:
    ExponentExpression ({infer BinaryExpression.left=current} operator=('*' | '/' | '%') right=ExponentExpression)*;

ExponentExpression infers Expression:
    PrefixExpression ({infer BinaryExpression.left=current} operator='^' right=PrefixExpression)*;

PrefixExpression infers Expression:
    UnaryExpression | CastExpression | AtomicExpression;

UnaryExpression:
    operator=('-' | 'not') expression=PrefixExpression;

CastExpression:
    '(' type=BaseType ')' expression=PrefixExpression;

AtomicExpression infers Expression:
    IfExpression | QuantifiedExpression | LetExpression | FailExpression
    | UndevelopedExpression | SolutionExpression | LibraryCallExpression
    | BuiltInCallExpression | FunctionCallExpression | ListExpression
    | SetExpression | IntegerLiteral | RealLiteral | BooleanLiteral
    | StringLiteral | ReferenceExpression | '(' Expression ')';

IfExpression:
    'if' condition=Expression 'then' thenExpression=Expression 'else' elseExpression=Expression;

QuantifiedExpression:
    quantifier=('forall' | 'exists') ('(' parameters+=Parameter ')')+ '.' expression=Expression;

LetExpression:
    'let' binding=LetBinding ';' expression=Expression;

LetBinding:
    name=ID ':' type=TypeRef '=' value=Expression;

FailExpression:
    'fail' (value=Expression | '**' message+=ClaimText+ '**');

UndevelopedExpression:
    {infer UndevelopedExpression} 'undeveloped';

SolutionExpression:
    'solution' name=ID ':' value=STRING;

LibraryCallExpression:
    library=ID '.' function=ID '(' (arguments+=Expression (',' arguments+=Expression)*)? ')';

BuiltInCallExpression:
    function=BuiltInFunction '(' (arguments+=Expression (',' arguments+=Expression)*)? ')';

FunctionCallExpression:
    function=[FunctionDefinition:QualifiedName] '(' (arguments+=Expression (',' arguments+=Expression)*)? ')';

ListExpression:
    '[' (first=Expression (('for' ('(' parameters+=Parameter ')')+ ('|' filter=Expression)?)
        | (',' rest+=Expression)*))? ']';

SetExpression:
    '{' (first=Expression (('for' ('(' parameters+=Parameter ')')+ ('|' filter=Expression)?)
        | (',' rest+=Expression)*))? '}';

IntegerLiteral:
    value=INT;

RealLiteral:
    value=REAL;

BooleanLiteral:
    value=('true' | 'false');

StringLiteral:
    value=STRING;

ReferenceExpression:
    reference=[NamedElement:QualifiedName];

BuiltInFunction returns string:
    'has_property' | 'property' | 'property_member' | 'has_parent' | 'parent'
    | 'name' | 'type' | 'has_type' | 'is_in_array' | 'has_prototypes' | 'has_modes'
    | 'is_processor' | 'is_virtual_processor' | 'is_system' | 'is_bus'
    | 'is_virtual_bus' | 'is_device' | 'is_memory' | 'is_thread'
    | 'is_thread_group' | 'is_process' | 'is_data' | 'is_subprogram'
    | 'is_of_type' | 'is_bound_to' | 'has_member' | 'features' | 'connections'
    | 'enumerated_values' | 'subcomponents' | 'source' | 'destination'
    | 'is_bidirectional' | 'direction' | 'is_event_port' | 'is_abstract_feature'
    | 'is_data_port' | 'is_port' | 'is_data_access' | 'is_bus_access'
    | 'lower_bound' | 'upper_bound' | 'member' | 'length' | 'size' | 'sum'
    | 'min' | 'max' | 'append' | 'head' | 'tail' | 'as_set' | 'union'
    | 'intersect' | 'as_list' | 'instance' | 'instances' | 'debug' | 'analysis'
    | 'receive_error' | 'contain_error' | 'propagate_error'
    | 'error_state_reachable' | 'flow_source' | 'flow_destination'
    | 'flow_elements' | 'flow_specifications' | 'end_to_end_flows';

type NamedElement =
    Definition | Parameter | LetBinding | ContextAttribute | AssumptionAttribute;

QualifiedName returns string:
    ID ('::' ID)* ('.' ID)?;

hidden terminal SL_COMMENT: /--[^\n\r]*/;
terminal REAL returns number: /[0-9](?:_?[0-9])*\.[0-9](?:_?[0-9])*(?:[eE][+-]?[0-9]+)?/;
terminal INT returns number: /[0-9](?:_?[0-9])*(?:[eE]\+?[0-9]+)?/;
terminal ID: /[A-Za-z](?:_?[A-Za-z0-9])*/;
terminal STRING: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/;
hidden terminal WS: /\s+/;
