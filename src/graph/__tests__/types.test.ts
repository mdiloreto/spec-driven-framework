import { expectTypeOf, it } from "vitest";
import { createGraphId } from "../../types/index.js";
import type { GraphEdge, GraphId, GraphNode } from "../../types/index.js";

it("keeps graph ids distinct from arbitrary strings", () => {
  const id = createGraphId("capability", "auth");
  expectTypeOf(id).toEqualTypeOf<GraphId>();
  expectTypeOf<GraphNode["id"]>().toEqualTypeOf<GraphId>();
  expectTypeOf<GraphEdge["from"]>().toEqualTypeOf<GraphId>();

  // @ts-expect-error Plain strings must be validated or constructed first.
  const invalid: GraphId = "capability:auth";
  expectTypeOf(invalid).toEqualTypeOf<GraphId>();
});
