import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type InitialsAvatarSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<InitialsAvatarSize, string> = {
  sm: "size-[34px] text-xs",
  md: "size-[38px] text-xs",
  lg: "size-14 text-base",
};

type InitialsAvatarProps = {
  name?: string | null;
  email?: string | null;
  size?: InitialsAvatarSize;
  className?: string;
};

function getInitials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Avatar de iniciais — fallback quando o usuário não tem foto de perfil.
 * Único ponto de implementação pra Header (`UserMenu`), `Sidebar` e
 * `ProfileCard`, que antes tinham 3 versões divergentes (uma com gradiente em
 * hex cru, cálculo de iniciais diferente em cada uma —
 * docs/50-AUDITORIA-BACKLOG.md, D5).
 *
 * `bg-accent text-accent-foreground` (sólido, não gradiente + branco): a
 * combinação antiga falhava AA na ponta mais clara do gradiente (mesma causa
 * raiz do D1).
 */
export function InitialsAvatar({ name, email, size = "md", className }: InitialsAvatarProps) {
  const initials = getInitials(name, email);

  return (
    <Avatar className={cn("shrink-0", SIZE_CLASSES[size], className)}>
      <AvatarFallback className="bg-accent font-bold text-accent-foreground">{initials}</AvatarFallback>
    </Avatar>
  );
}
