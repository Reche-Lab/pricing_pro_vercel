import { describe, expect, it } from "vitest";
import { validateQuoteItemEdit } from "@/domain/quotes/item-edit";

describe("quote item membership edits", () => {
  const current = [{ id: "one" }, { id: "two" }];

  it("identifies additions and removals without replacing retained items", () => {
    expect(validateQuoteItemEdit(current, [{ id: "two" }, {}], ["one", "two"]))
      .toEqual({ addedCount: 1, removedIds: ["one"] });
  });

  it("preserves compatibility with edits of existing items", () => {
    expect(validateQuoteItemEdit(current, current)).toEqual({ addedCount: 0, removedIds: [] });
  });

  it("rejects the removal of the last item and excessive additions", () => {
    expect(() => validateQuoteItemEdit(current, [], ["one", "two"])).toThrow(/ao menos um/);
    expect(() => validateQuoteItemEdit(current, Array.from({ length: 51 }, () => ({})))).toThrow(/50/);
  });

  it("rejects duplicate IDs and IDs from another quote", () => {
    expect(() => validateQuoteItemEdit(current, [{ id: "one" }, { id: "one" }])).toThrow(/repetido/);
    expect(() => validateQuoteItemEdit(current, [{ id: "foreign" }])).toThrow(/pertence/);
  });

  it("requires a current item list for structural edits", () => {
    expect(() => validateQuoteItemEdit(current, [{ id: "one" }])).toThrow(/Recarregue/);
    expect(() => validateQuoteItemEdit(current, [{ id: "one" }], ["one"])).toThrow(/Recarregue/);
    expect(() => validateQuoteItemEdit(current, current, ["one"])).toThrow(/Recarregue/);
  });
});
