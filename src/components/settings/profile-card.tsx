import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ProfileCardProps = {
  name: string;
  email: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Perfil — só exibição (docs/12-SETTINGS.md, item 1): sem action de update
 * de usuário ainda, nome/email vêm direto da sessão (`auth()`).
 */
export function ProfileCard({ name, email }: ProfileCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>Dados da sua conta.</CardDescription>
      </CardHeader>

      <CardContent className="flex items-center gap-4">
        <Avatar size="lg">
          <AvatarFallback className="bg-gradient-to-br from-accent to-orange-700 font-bold text-white">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-foreground">{name}</p>
          <p className="truncate text-[13px] font-medium text-muted-foreground">{email}</p>
        </div>
      </CardContent>
    </Card>
  );
}
