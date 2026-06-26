import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf, isValidCpfOrCnpj } from "@/lib/validation/documents";

describe("document validation", () => {
  it("validates CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("validates CNPJ", () => {
    expect(isValidCnpj("04.252.011/0001-10")).toBe(true);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });

  it("accepts empty optional document fields", () => {
    expect(isValidCpfOrCnpj("")).toBe(true);
  });
});
