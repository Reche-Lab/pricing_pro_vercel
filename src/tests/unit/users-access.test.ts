import { describe, expect, it } from "vitest";
import { canAssignRole, canManageMember, isMemberStatus } from "@/domain/users/access";

describe("user access rules", () => {
  it("allows owners to assign every role and admins only non-owner roles", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("owner", "sales")).toBe(true);
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "manager")).toBe(true);
    expect(canAssignRole("sales", "viewer")).toBe(false);
  });

  it("prevents users from managing themselves and protects owners from admins", () => {
    expect(canManageMember({ userId: "u1", role: "owner" }, { userId: "u2", role: "admin" })).toBe(true);
    expect(canManageMember({ userId: "u1", role: "owner" }, { userId: "u1", role: "owner" })).toBe(false);
    expect(canManageMember({ userId: "u1", role: "admin" }, { userId: "u2", role: "owner" })).toBe(false);
    expect(canManageMember({ userId: "u1", role: "admin" }, { userId: "u2", role: "sales" })).toBe(true);
  });

  it("validates membership statuses", () => {
    expect(isMemberStatus("active")).toBe(true);
    expect(isMemberStatus("blocked")).toBe(true);
    expect(isMemberStatus("deleted")).toBe(false);
  });
});
