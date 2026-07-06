import { LogOut } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/modules/auth/actions";

/**
 * Sessão — docs/12-SETTINGS.md, item 6. Mesmo padrão de
 * `components/layout/user-menu.tsx`: `<form action={logoutAction}>` nativo
 * (Server Action chama `signOut` + `redirect`, que precisa propagar sem
 * passar por um `try/catch` de client — por isso não usamos `ConfirmDialog`
 * aqui, ele engoliria o redirect).
 */
export function SessionCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessão</CardTitle>
        <CardDescription>Encerre sua sessão neste dispositivo.</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={logoutAction} className="contents">
          <Button type="submit" variant="destructive" className="w-fit">
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
