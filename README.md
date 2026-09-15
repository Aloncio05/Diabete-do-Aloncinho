# Diário do Aloncinho

Painel pessoal de glicose e refeições, pensado para uso em um único navegador.

## Stack

- HTML, CSS e JavaScript puro no navegador.
- Função serverless do Vercel para a estimativa de carboidratos por IA.
- Armazenamento local do navegador para registros, orientação textual e preferências.

## O que faz

- Registra medições de dedo em mg/dL, com data, hora e observação opcional, e classifica a faixa pessoal: abaixo de 80, entre 80–190 e acima de 190.
- Mostra o percentual de medições na faixa e um gráfico de tendência das últimas 14 leituras. Para registros pontuais, não apresenta isso como tempo contínuo na faixa.
- Organiza refeições em Café, Almoço, Lanche e Jantar.
- Permite estimar uma faixa de carboidratos por descrição, porção e foto opcional. A estimativa precisa de confirmação antes de entrar no diário.
- Envia descrição/foto à IA somente após consentimento explícito no momento da solicitação; não envia medições, histórico ou orientação médica.
- Guarda um texto de orientação médica digitado pela própria pessoa apenas como referência visual, sem interpretar ou usar o conteúdo em cálculos.
- Exporta glicemia e carboidratos em planilha CSV e abre um relatório local pronto para salvar em PDF.
- Mantém os registros no armazenamento local do navegador, com exclusão a qualquer momento.

## Limite importante

O projeto não calcula, recomenda, confirma ou registra doses de insulina. Ele é uma ferramenta de registro e apoio e não substitui o plano definido pela equipe de saúde. Decisões de dose devem seguir a orientação recebida da equipe de saúde.

## Publicação no Vercel

O repositório já contém a configuração Vercel para publicar a interface em `public` e usar a função `api/estimate-carbs.js` para a estimativa de carboidratos.

A contagem de carboidratos funciona sem nenhuma configuração: a tabela de
alimentos com medidas caseiras roda no navegador, offline.

A estimativa por IA é opcional e usa a API do Gemini, cujo nível gratuito não
pede cartão. Para ativá-la, cadastre no Vercel as variáveis de `.env.example`:

- `GEMINI_API_KEY`: chave do Google AI Studio, somente no servidor.
- `GEMINI_MODEL`: opcional. Padrão `gemini-3.1-flash-lite`. Precisa aceitar
  imagem na entrada e `responseSchema`.
- `APP_ACCESS_TOKEN`: código privado solicitado na tela antes de cada estimativa.

No nível gratuito, o Google usa o conteúdo enviado para melhorar os produtos
dele. Quem não quiser isso deve usar a tabela de alimentos ou o nível pago.

Nunca coloque a chave da API no navegador, no repositório ou em uma variável pública.

Checagem do endpoint, sem rede e sem chave: `node scripts/test-estimate-carbs.mjs`.

## Dados

Não inclua no repositório medições, fotos, informações médicas pessoais, chaves de API ou credenciais.
