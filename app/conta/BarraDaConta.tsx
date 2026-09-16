import { auth, loginConfigurado } from "@/auth";
import { bancoConfigurado } from "@/db";
import { entrar, sair } from "./actions";

// Barra do topo. Renderiza no servidor porque é lá que a sessão existe.
export default async function BarraDaConta() {
  // Sem login configurado não há o que mostrar: o app segue guardando no
  // navegador, e uma barra de conta só confundiria.
  if (!loginConfigurado) return null;

  const sessao = await auth();
  const sincronizaDeVerdade = bancoConfigurado();

  if (!sessao?.user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div>
          <div className="text-sm font-semibold">Seus dados ficam só neste aparelho</div>
          <div className="mt-1 text-xs text-slate-400">
            Entre com o Google para ver o mesmo diário no notebook e no celular.
          </div>
        </div>

        <form action={entrar}>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-500"
          >
            Entrar com Google
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{sessao.user.email}</div>
        <div className="mt-1 text-xs text-slate-400">
          {sincronizaDeVerdade
            ? "Diário sincronizado nesta conta."
            : "Banco não configurado: os dados ainda ficam só neste aparelho."}
        </div>
      </div>

      <form action={sair}>
        <button
          type="submit"
          className="rounded-xl border border-slate-700 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
