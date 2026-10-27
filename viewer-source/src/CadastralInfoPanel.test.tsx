import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CadastralInfoPanel } from "./CadastralInfoPanel";

afterEach(cleanup);

it("starts collapsed and lets users expand and collapse cadastral details", () => {
  const onClose = vi.fn();
  const { rerender } = render(<CadastralInfoPanel parcelNo="221" onClose={onClose}>地籍內容</CadastralInfoPanel>);
  expect(screen.queryByRole("complementary", { name: "地籍資訊" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "展開地籍資訊，地號 221" }));
  expect(screen.getByRole("complementary", { name: "地籍資訊" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "將地籍資訊收合到右側" }));
  expect(screen.queryByRole("complementary", { name: "地籍資訊" })).not.toBeInTheDocument();
  // App keys this panel by parcel number; each newly selected parcel starts collapsed.
  rerender(<CadastralInfoPanel key="646-2" parcelNo="646-2" onClose={onClose}>新地籍內容</CadastralInfoPanel>);
  fireEvent.click(screen.getByRole("button", { name: "展開地籍資訊，地號 646-2" }));
  fireEvent.click(screen.getByRole("button", { name: "關閉地籍資訊" }));
  expect(onClose).toHaveBeenCalledOnce();
});
