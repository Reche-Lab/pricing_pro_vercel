export function createProductSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isProductDeletionConfirmation(value: unknown): value is string {
  return typeof value === "string" && value.trim().toLocaleLowerCase("pt-BR") === "excluir";
}
