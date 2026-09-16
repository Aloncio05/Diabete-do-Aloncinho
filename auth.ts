import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Sessão em JWT, sem tabela de usuários: o diário é guardado por id da conta
// Google, então não há nada de auth para persistir. Menos banco, menos a
// guardar sobre você.
//
// O login é opcional de propósito. Sem AUTH_GOOGLE_ID configurado, o provedor
// não entra, "entrar" some da tela e o app segue guardando no navegador — é o
// que mantém a produção funcionando enquanto as variáveis não existem.
export const loginConfigurado = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET,
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: loginConfigurado
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  callbacks: {
    // O `sub` do Google é estável e é o que identifica o dono do diário.
    jwt({ token, profile }) {
      if (profile?.sub) token.sub = profile.sub;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
