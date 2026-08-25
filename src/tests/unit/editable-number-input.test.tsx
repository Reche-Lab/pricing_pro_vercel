import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { EditableNumberInput } from "@/components/ui/EditableNumberInput";

function Example() {
  const [value, setValue] = useState(0);
  return <><EditableNumberInput aria-label="Quantidade" value={value} onValueChange={setValue}/><output>{value}</output></>;
}

describe("EditableNumberInput", () => {
  it("allows clearing the current value before entering another number", () => {
    render(<Example/>);
    const input = screen.getByLabelText("Quantidade") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(screen.getByText("0")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "25" } });
    expect(input.value).toBe("25");
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("restores the last valid value when focus leaves an empty field", () => {
    render(<Example/>);
    const input = screen.getByLabelText("Quantidade") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("0");
  });
});
