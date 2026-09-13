"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, htmlFor, ...props }, forwardedRef) => {
  const localRef = React.useRef<React.ElementRef<typeof LabelPrimitive.Root>>(null);
  const generatedId = React.useId().replace(/:/g, "");

  React.useEffect(() => {
    if (htmlFor || !localRef.current) return;

    const parent = localRef.current.parentElement;
    if (!parent) return;

    const controls = parent.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]), textarea, select, button[role="combobox"]',
    );

    // Só associa automaticamente quando o grupo contém um único controle.
    // Grupos compostos continuam exigindo associação explícita para não criar
    // uma relação ambígua entre rótulo e campo.
    if (controls.length !== 1) return;

    const control = controls[0];
    if (!control.id) control.id = `segempat-field-${generatedId}`;
    localRef.current.htmlFor = control.id;
  }, [generatedId, htmlFor]);

  const setRef = React.useCallback(
    (node: React.ElementRef<typeof LabelPrimitive.Root> | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  return (
    <LabelPrimitive.Root
      ref={setRef}
      htmlFor={htmlFor}
      className={cn(labelVariants(), className)}
      {...props}
    />
  );
});
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
