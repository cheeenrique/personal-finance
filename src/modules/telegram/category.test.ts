import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryType } from "@/generated/prisma/enums";
import { CategoryParentTypeMismatchError } from "@/modules/categories/errors";

const createCategoryMock = vi.fn();
const listTreeMock = vi.fn();
const matchCategoryByNameMock = vi.fn();

vi.mock("@/modules/categories/service", () => ({
  categoryService: { createCategory: createCategoryMock, listTree: listTreeMock },
}));
vi.mock("./resolve", () => ({ matchCategoryByName: matchCategoryByNameMock }));

const { handleCreateCategory } = await import("./category");

function categoryNode(overrides: Partial<{ id: string; name: string; type: CategoryType; parentId: string | null }> = {}) {
  return {
    id: overrides.id ?? "cat-1",
    userId: "user-1",
    name: overrides.name ?? "Transporte",
    type: overrides.type ?? CategoryType.EXPENSE,
    parentId: overrides.parentId ?? null,
    icon: null,
    color: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    children: [],
  };
}

describe("handleCreateCategory", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("categoryName ausente — pede o nome, sem tocar o service", async () => {
    const result = await handleCreateCategory("user-1", { categoryName: null, parentName: null });

    expect(result.resultCode).toBe("create_category_need_name");
    expect(createCategoryMock).not.toHaveBeenCalled();
  });

  it("sem parentName — cria top-level EXPENSE", async () => {
    listTreeMock.mockResolvedValueOnce([]);
    createCategoryMock.mockResolvedValueOnce(categoryNode({ name: "Academia" }));

    const result = await handleCreateCategory("user-1", { categoryName: "Academia", parentName: null });

    expect(createCategoryMock).toHaveBeenCalledWith("user-1", { name: "Academia", type: CategoryType.EXPENSE });
    expect(result.resultCode).toBe("create_category_created");
    expect(result.text).toContain("Academia");
    expect(matchCategoryByNameMock).not.toHaveBeenCalled();
  });

  it("com parentName resolvendo pra categoria EXPENSE — filha herda EXPENSE", async () => {
    matchCategoryByNameMock.mockResolvedValueOnce({ id: "parent-1", name: "Transporte", type: CategoryType.EXPENSE });
    listTreeMock.mockResolvedValueOnce([]);
    createCategoryMock.mockResolvedValueOnce(
      categoryNode({ name: "Pedágio", type: CategoryType.EXPENSE, parentId: "parent-1" }),
    );

    const result = await handleCreateCategory("user-1", { categoryName: "Pedágio", parentName: "Transporte" });

    expect(createCategoryMock).toHaveBeenCalledWith("user-1", {
      name: "Pedágio",
      type: CategoryType.EXPENSE,
      parentId: "parent-1",
    });
    expect(result.resultCode).toBe("create_category_created");
    expect(result.text).toContain("Pedágio");
    expect(result.text).toContain("Transporte");
  });

  it("com parentName resolvendo pra categoria INCOME — filha herda INCOME", async () => {
    matchCategoryByNameMock.mockResolvedValueOnce({ id: "parent-2", name: "Salário", type: CategoryType.INCOME });
    listTreeMock.mockResolvedValueOnce([]);
    createCategoryMock.mockResolvedValueOnce(
      categoryNode({ name: "Bônus", type: CategoryType.INCOME, parentId: "parent-2" }),
    );

    const result = await handleCreateCategory("user-1", { categoryName: "Bônus", parentName: "Salário" });

    expect(createCategoryMock).toHaveBeenCalledWith("user-1", {
      name: "Bônus",
      type: CategoryType.INCOME,
      parentId: "parent-2",
    });
    expect(result.resultCode).toBe("create_category_created");
  });

  it("parentName que não bate com nenhuma categoria real — não encontrado, sem criar", async () => {
    matchCategoryByNameMock.mockResolvedValueOnce(null);

    const result = await handleCreateCategory("user-1", { categoryName: "Pedágio", parentName: "Inexistente" });

    expect(result.resultCode).toBe("create_category_parent_not_found");
    expect(result.text).toContain("Inexistente");
    expect(createCategoryMock).not.toHaveBeenCalled();
  });

  it("nome duplicado top-level — bloqueia, sem chamar createCategory", async () => {
    listTreeMock.mockResolvedValueOnce([categoryNode({ name: "Academia", type: CategoryType.EXPENSE, parentId: null })]);

    const result = await handleCreateCategory("user-1", { categoryName: "academia", parentName: null });

    expect(result.resultCode).toBe("create_category_duplicate");
    expect(createCategoryMock).not.toHaveBeenCalled();
  });

  it("nome duplicado sob o mesmo pai — bloqueia, sem chamar createCategory", async () => {
    matchCategoryByNameMock.mockResolvedValueOnce({ id: "parent-1", name: "Transporte", type: CategoryType.EXPENSE });
    listTreeMock.mockResolvedValueOnce([
      categoryNode({ name: "Pedágio", type: CategoryType.EXPENSE, parentId: "parent-1" }),
    ]);

    const result = await handleCreateCategory("user-1", { categoryName: "Pedágio", parentName: "Transporte" });

    expect(result.resultCode).toBe("create_category_duplicate");
    expect(createCategoryMock).not.toHaveBeenCalled();
  });

  it("categoryService.createCategory lança CategoryDomainError inesperado — vira buildErrorReply, não propaga", async () => {
    matchCategoryByNameMock.mockResolvedValueOnce({ id: "parent-1", name: "Transporte", type: CategoryType.EXPENSE });
    listTreeMock.mockResolvedValueOnce([]);
    createCategoryMock.mockRejectedValueOnce(new CategoryParentTypeMismatchError("parent-1", "INCOME", "EXPENSE"));

    const result = await handleCreateCategory("user-1", { categoryName: "Pedágio", parentName: "Transporte" });

    expect(result.resultCode).toBe("create_category_error");
    expect(result.text).toContain("mesmo tipo do pai");
  });
});
