import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.sireum.IS;
import org.sireum.IS$;
import org.sireum.Map;
import org.sireum.Option;
import org.sireum.Z;
import org.sireum.Z$;
import org.sireum.hamr.codegen.common.CommonUtil.StoreValue;
import org.sireum.hamr.codegen.common.util.ModelUtil.ModelElements;
import org.sireum.hamr.sysml.FrontEnd;
import org.sireum.hamr.sysml.stipe.TypeHierarchy;
import org.sireum.hamr.sysml.symbol.TypeInfo;
import org.sireum.message.Message;
import org.sireum.message.Position;
import org.sireum.message.Reporter;
import scala.Tuple3;
import scala.collection.immutable.$colon$colon;
import scala.collection.immutable.Nil$;

/** Adapts line-delimited JSON requests to Sireum's in-process SysML frontend. */
public final class ResoluteSireumBridge {
  private static final int PROTOCOL_VERSION = 1;
  private static final JsonFactory JSON = new JsonFactory();
  private static Map<org.sireum.String, StoreValue> store = Map.empty();

  private record SourceFile(String uri, String text) {}
  private record Request(long id, String method, List<SourceFile> files) {}

  /** Runs the long-lived request loop and keeps protocol output isolated on stdout. */
  public static void main(String[] args) throws Exception {
    try (BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
      String line;
      while ((line = input.readLine()) != null) {
        if (line.isBlank()) continue;
        try {
          Request request = parseRequest(line);
          System.out.println(handle(request));
        } catch (Throwable error) {
          error.printStackTrace(System.err);
          System.out.println(errorResponse(-1, error.toString()));
        }
        System.out.flush();
      }
    }
  }

  /** Dispatches handshake and type-check operations. */
  private static String handle(Request request) throws Exception {
    if ("handshake".equals(request.method)) return handshakeResponse(request.id);
    if (!"typeCheck".equals(request.method)) return errorResponse(request.id, "Unknown method: " + request.method);
    List<FrontEnd.Input> javaInputs = new ArrayList<>();
    for (SourceFile file : request.files) javaInputs.add(new FrontEnd.Input(file.text, Option.some(new org.sireum.String(file.uri))));
    Reporter reporter = Reporter.create();
    Tuple3<Option<org.sireum.hamr.sysml.stipe.TypeHierarchy>, IS<Z, ModelElements>, Map<org.sireum.String, StoreValue>> result =
      FrontEnd.typeCheck(Z.apply(0), toIS(javaInputs), store, reporter);
    store = result._3();
    return typeCheckResponse(request.id, result._1(), result._2(), reporter.messages(), reporter.hasError());
  }

  /** Converts a Java list into Sireum's immutable zero-indexed sequence. */
  @SuppressWarnings({"unchecked", "rawtypes"})
  private static <T> IS<Z, T> toIS(List<T> values) {
    scala.collection.immutable.List<T> seq = (scala.collection.immutable.List<T>) Nil$.MODULE$;
    for (int i = values.size() - 1; i >= 0; i--) seq = new $colon$colon<>(values.get(i), seq);
    return IS$.MODULE$.apply(seq, Z$.MODULE$);
  }

  /** Parses the intentionally small bridge request schema. */
  private static Request parseRequest(String json) throws Exception {
    long id = -1;
    String method = "";
    List<SourceFile> files = new ArrayList<>();
    try (JsonParser parser = JSON.createParser(json)) {
      if (parser.nextToken() != JsonToken.START_OBJECT) throw new IllegalArgumentException("Expected request object");
      while (parser.nextToken() != JsonToken.END_OBJECT) {
        String field = parser.currentName();
        parser.nextToken();
        if ("id".equals(field)) id = parser.getLongValue();
        else if ("method".equals(field)) method = parser.getValueAsString();
        else if ("files".equals(field)) readFiles(parser, files);
        else parser.skipChildren();
      }
    }
    return new Request(id, method, files);
  }

  /** Reads source file objects from one request. */
  private static void readFiles(JsonParser parser, List<SourceFile> files) throws Exception {
    if (parser.currentToken() != JsonToken.START_ARRAY) { parser.skipChildren(); return; }
    while (parser.nextToken() != JsonToken.END_ARRAY) {
      String uri = "";
      String text = "";
      while (parser.nextToken() != JsonToken.END_OBJECT) {
        String field = parser.currentName();
        parser.nextToken();
        if ("uri".equals(field)) uri = parser.getValueAsString();
        else if ("text".equals(field)) text = parser.getValueAsString();
        else parser.skipChildren();
      }
      files.add(new SourceFile(uri, text));
    }
  }

  /** Serializes a successful compatibility handshake. */
  private static String handshakeResponse(long id) throws Exception {
    return generate(generator -> {
      base(generator, id);
      generator.writeObjectFieldStart("result");
      generator.writeNumberField("protocolVersion", PROTOCOL_VERSION);
      generator.writeStringField("sireumVersion", "local");
      generator.writeEndObject();
      generator.writeEndObject();
    });
  }

  /** Serializes canonical AIR JSON and source diagnostics from one frontend run. */
  private static String typeCheckResponse(long id, Option<TypeHierarchy> hierarchy, IS<Z, ModelElements> models,
      IS<Z, Message> messages, boolean hasError) throws Exception {
    return generate(generator -> {
      base(generator, id);
      generator.writeObjectFieldStart("result");
      generator.writeBooleanField("hasError", hasError);
      generator.writeArrayFieldStart("air");
      for (long i = 0; i < models.sizeS64(); i++) generator.writeString(org.sireum.hamr.ir.JSON.fromAadl(models.apply(i).model(), false));
      generator.writeEndArray();
      writeModelMetadata(generator, hierarchy);
      generator.writeArrayFieldStart("diagnostics");
      for (long i = 0; i < messages.sizeS64(); i++) writeDiagnostic(generator, messages.apply(i));
      generator.writeEndArray();
      generator.writeEndObject();
      generator.writeEndObject();
    });
  }

  /** Exports declaration facts that AIR instances do not retain. */
  private static void writeModelMetadata(JsonGenerator generator, Option<TypeHierarchy> hierarchy) throws Exception {
    generator.writeObjectFieldStart("metadata");
    generator.writeArrayFieldStart("propertyEnumerations");
    if (hierarchy.nonEmpty()) {
      TypeHierarchy types = hierarchy.get();
      IS<Z, scala.Tuple2<IS<Z, org.sireum.String>, TypeInfo>> entries = types.typeMap().entries();
      for (long entryIndex = 0; entryIndex < entries.sizeS64(); entryIndex++) {
        TypeInfo info = entries.apply(entryIndex)._2();
        if (!(info instanceof TypeInfo.AttributeDefinition property)) continue;
        IS<Z, org.sireum.hamr.ir.Typed.Name> ancestors = property.ancestors();
        for (long ancestorIndex = 0; ancestorIndex < ancestors.sizeS64(); ancestorIndex++) {
          Option<TypeInfo> ancestorInfo = types.typeMap().get(ancestors.apply(ancestorIndex).ids());
          if (ancestorInfo.nonEmpty() && ancestorInfo.get() instanceof TypeInfo.EnumDefinition enumeration) {
            generator.writeStartObject();
            generator.writeStringField("name", qualifiedName(property.name()));
            generator.writeArrayFieldStart("values");
            IS<Z, org.sireum.String> values = enumeration.elements().keys();
            for (long valueIndex = 0; valueIndex < values.sizeS64(); valueIndex++) {
              generator.writeString(values.apply(valueIndex).value());
            }
            generator.writeEndArray();
            generator.writeEndObject();
          }
        }
      }
    }
    generator.writeEndArray();
    generator.writeEndObject();
  }

  /** Joins a Sireum qualified-name sequence using SysML namespace separators. */
  private static String qualifiedName(IS<Z, org.sireum.String> segments) {
    StringBuilder result = new StringBuilder();
    for (long index = 0; index < segments.sizeS64(); index++) {
      if (!result.isEmpty()) result.append("::");
      result.append(segments.apply(index).value());
    }
    return result.toString();
  }

  /** Serializes one Sireum message using LSP-compatible zero-based ranges. */
  private static void writeDiagnostic(JsonGenerator generator, Message message) throws Exception {
    generator.writeStartObject();
    generator.writeStringField("severity", message.isError() || message.isInternalError() ? "error" : message.isWarning() ? "warning" : "information");
    generator.writeStringField("message", message.text());
    generator.writeStringField("source", message.kind());
    if (message.posOpt().nonEmpty()) {
      Position pos = message.posOpt().get();
      if (pos.uriOpt().nonEmpty()) generator.writeStringField("uri", pos.uriOpt().get().value());
      generator.writeNumberField("startLine", Math.max(0, pos.beginLine().toLong() - 1));
      generator.writeNumberField("startCharacter", Math.max(0, pos.beginColumn().toLong() - 1));
      generator.writeNumberField("endLine", Math.max(0, pos.endLine().toLong() - 1));
      generator.writeNumberField("endCharacter", Math.max(0, pos.endColumn().toLong()));
    }
    generator.writeEndObject();
  }

  private static String errorResponse(long id, String message) throws Exception {
    return generate(generator -> {
      base(generator, id);
      generator.writeObjectFieldStart("error");
      generator.writeStringField("message", message);
      generator.writeEndObject();
      generator.writeEndObject();
    });
  }

  private static void base(JsonGenerator generator, long id) throws Exception {
    generator.writeStartObject();
    generator.writeNumberField("protocolVersion", PROTOCOL_VERSION);
    generator.writeNumberField("id", id);
  }

  @FunctionalInterface private interface JsonWriter { void write(JsonGenerator generator) throws Exception; }

  private static String generate(JsonWriter writer) throws Exception {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (JsonGenerator generator = JSON.createGenerator(bytes)) { writer.write(generator); }
    return bytes.toString(StandardCharsets.UTF_8);
  }
}
