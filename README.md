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

Para ativar a estimativa por IA, cadastre no Vercel as três variáveis listadas em `.env.example`:

- `OPENAI_API_KEY`: segredo da integração oficial da API, somente no servidor.
- `OPENAI_MODEL`: modelo compatível com imagem e saída estruturada.
- `APP_ACCESS_TOKEN`: código privado solicitado na tela antes de cada estimativa.

Nunca coloque a chave da API no navegador, no repositório ou em uma variável pública.

## Dados

Não inclua no repositório medições, fotos, informações médicas pessoais, chaves de API ou credenciais.
