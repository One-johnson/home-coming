import Link from "next/link";
import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"] | "primary";

function mapVariant(variant?: ButtonVariant) {
  if (variant === "primary") return "default";
  return variant;
}

type LinkButtonProps = Omit<ComponentProps<typeof Button>, "variant"> &
  VariantProps<typeof buttonVariants> & {
    variant?: ButtonVariant;
    href?: string;
    external?: boolean;
  };

const linkButtonClassName =
  "rounded-full px-7 py-3 font-semibold tracking-wide transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";

export function LinkButton({
  href,
  external,
  variant = "default",
  size,
  className,
  children,
  ...props
}: LinkButtonProps) {
  const resolvedVariant = mapVariant(variant);

  if (href) {
    const classes = cn(
      buttonVariants({ variant: resolvedVariant, size }),
      linkButtonClassName,
      className,
    );

    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={classes}
        >
          {children}
        </a>
      );
    }

    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <Button
      variant={resolvedVariant}
      size={size}
      className={cn(linkButtonClassName, className)}
      {...props}
    >
      {children}
    </Button>
  );
}

export { Button, buttonVariants };
