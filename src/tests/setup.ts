import "@testing-library/jest-dom/vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/pricing_pro_test";
process.env.AUTH_SECRET ??= "test-auth-secret-with-at-least-32-characters";
process.env.APP_ENCRYPTION_KEY ??= "test-encryption-secret-with-at-least-32-characters";
