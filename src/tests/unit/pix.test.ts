import { describe, expect, it } from "vitest";
import {
  buildPixPaymentSnapshot,
  isValidPixKey,
  normalizePixKey,
  parsePixPaymentSnapshot,
  pixKeyTypeLabel
} from "@/domain/payments/pix";

describe("Pix payment data", () => {
  it("normalizes document, e-mail and Brazilian phone keys", () => {
    expect(normalizePixKey("cpf", "313.527.338-54")).toBe("31352733854");
    expect(normalizePixKey("email", " FINANCEIRO@EXAMPLE.COM ")).toBe("financeiro@example.com");
    expect(normalizePixKey("phone", "(12) 99700-3322")).toBe("+5512997003322");
    expect(normalizePixKey("phone", "+55 12 99700-3322")).toBe("+5512997003322");
  });

  it("validates every supported Pix key type", () => {
    expect(isValidPixKey("cpf", "313.527.338-54")).toBe(true);
    expect(isValidPixKey("cnpj", "11.222.333/0001-81")).toBe(true);
    expect(isValidPixKey("email", "financeiro@example.com")).toBe(true);
    expect(isValidPixKey("phone", "+55 12 99700-3322")).toBe(true);
    expect(isValidPixKey("random", "123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isValidPixKey("cpf", "111.111.111-11")).toBe(false);
    expect(isValidPixKey("random", "qualquer-chave")).toBe(false);
  });

  it("builds and safely parses an immutable quote snapshot", () => {
    const snapshot = buildPixPaymentSnapshot({
      keyType: "email",
      key: " PAGAMENTOS@EXAMPLE.COM ",
      beneficiaryName: " Ground Shop "
    });

    expect(snapshot).toEqual({
      keyType: "email",
      key: "pagamentos@example.com",
      beneficiaryName: "Ground Shop"
    });
    expect(parsePixPaymentSnapshot(snapshot)).toEqual(snapshot);
    expect(parsePixPaymentSnapshot({ keyType: "cpf", key: "inválida" })).toBeNull();
    expect(pixKeyTypeLabel("random")).toBe("Chave aleatória");
  });
});
