# Diário do Aloncinho

Painel pessoal de glicose e refeições, pensado para uso em um único navegador.

## Stack

- HTML, CSS e JavaScript puro no navegador.
- Função serverless do Vercel para a estimativa de carboidratos por IA.
- Armazenamento local do navegador para registros, orientação textual e preferências.

## O que faz

- Registra medições de dedo em mg/dL, com data, hora e observação opcional, e classifica a faixa pessoal: abaixo de 80, entre 80–190 e acima de 190.
- Mostra o percentual de medições na faixa e um gráfico de tendência. Para registros pontuais, não apresenta isso como tempo contínuo na faixa.
- Painel de acompanhamento com recorte por atalho (7, 30, 90 dias ou tudo) ou por intervalo de datas. Tudo o que o painel mostra segue o recorte escolhido: contagens, média, medições por dia, carboidratos por dia e o gráfico.
- Compara o recorte atual com o período anterior de mesma duração. Só o percentual de medições na faixa ganha cor de melhora ou piora, porque subir é o objetivo declarado do painel; a média aparece sem juízo de valor.
- Com poucas leituras o gráfico mostra cada medição; com muitas, uma média por dia.
- Organiza refeições em Café, Almoço, Lanche e Jantar.
- Guarda refeições padrão: combinações nomeadas que voltam para a montagem com um toque, com o histórico de quantas vezes e quando foram usadas. Usar uma padrão só preenche os itens — o registro no diário continua dependendo do "Salvar refeição".
- Permite estimar uma faixa de carboidratos por descrição, porção e foto opcional, tirada na hora pela câmera ou escolhida da galeria. A estimativa precisa de confirmação antes de entrar no diário.
- Envia descrição/foto à IA somente após consentimento explícito no momento da solicitação; não envia medições, histórico ou orientação médica.
- Guarda um texto de orientação médica digitado pela própria pessoa apenas como referência visual, sem interpretar ou usar o conteúdo em cálculos.
- Baixa um backup `.json` com o diário inteiro — medições, refeições com todos os itens e faixas, refeições padrão, favoritos, parâmetros e orientação — e restaura esse arquivo em outro navegador. É o único caminho que preserva tudo.
- Importa exportações de outros apps (Glic e similares) em `.csv`, ignorando o que já está no diário. A planilha CSV do próprio app serve para ler e compartilhar, não para restaurar: ela achata a faixa de carboidratos e junta os itens de uma refeição numa linha por item.
- Exporta glicemia e carboidratos em planilha CSV e abre um relatório local pronto para salvar em PDF.
- Mantém os registros no armazenamento local do navegador, com exclusão a qualquer momento.

Restaurar um backup **substitui** o que está salvo no navegador. A tela mostra o
que vem no arquivo ao lado do que já existe antes de confirmar. O arquivo de
backup sai do dispositivo com tudo, inclusive o texto da orientação médica.

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

Checagens, sem rede e sem chave:

```
node scripts/test-estimate-carbs.mjs
node scripts/test-csv.mjs
node scripts/test-dashboard.mjs
node scripts/test-backup.mjs
```

## Dados

Não inclua no repositório medições, fotos, informações médicas pessoais, chaves de API ou credenciais.
