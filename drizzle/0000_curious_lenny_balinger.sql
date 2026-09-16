CREATE TABLE "diarios" (
	"usuario_id" text PRIMARY KEY NOT NULL,
	"dados" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
