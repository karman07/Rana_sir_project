import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

export function Avatar({ name, src, size = 32, className }: { name: string; src?: string; size?: number; className?: string }) {
  return (
    <AvatarPrimitive.Root
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-gold-soft font-medium text-foreground-2", className)}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
