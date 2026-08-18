import React, { useRef, useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

function Chevron({ direction = "down" }) {
  return (
    <svg className={`select-chevron is-${direction}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d={direction === "up" ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4"} />
    </svg>
  );
}

export default function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  ariaLabel,
  className = "",
}) {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState(null);

  function handleOpenChange(nextOpen) {
    if (nextOpen) setPortalContainer(triggerRef.current?.closest("dialog") || document.body);
    setOpen(nextOpen);
  }

  return (
    <div className={`library-select ${className}`.trim()}>
      <SelectPrimitive.Root
        value={value || undefined}
        onValueChange={onValueChange}
        open={open}
        onOpenChange={handleOpenChange}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger ref={triggerRef} className="select-trigger" aria-label={ariaLabel}>
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon className="select-trigger-icon"><Chevron /></SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal container={portalContainer || undefined}>
          <SelectPrimitive.Content className="select-content" position="popper" sideOffset={6} collisionPadding={12}>
            <SelectPrimitive.ScrollUpButton className="select-scroll-button"><Chevron direction="up" /></SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="select-viewport">
              {options.map((option) => (
                <SelectPrimitive.Item className="select-option" key={option.value} value={String(option.value)} disabled={option.disabled}>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="select-option-indicator">✓</SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="select-scroll-button"><Chevron /></SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
