# Grid: fluidez, oficina e masmorras · atualização 024

## O que mudou

O catálogo passou de **46 para 62 elementos**, com **112 variantes adicionais**. Todos os novos modelos têm desenho em 2D e geometria em 3D, aceitam os estilos e cores existentes e preservam sua área lógica no grid.

| Elemento novo     | Uso e variantes                                             |
| ----------------- | ----------------------------------------------------------- |
| Porta de masmorra | Madeira ou ferro; aberta e fechada.                         |
| Grade levadiça    | Baixada ou erguida; permite visão através da grade.         |
| Pilar             | Inteiro ou quebrado.                                        |
| Altar             | Cerimonial ou arcano, com iluminação configurável.          |
| Sarcófago         | Aberto ou fechado.                                          |
| Cela de prisão    | Aberta ou fechada; barras não bloqueiam a visão por padrão. |
| Suporte de armas  | Armas ou armadura.                                          |
| Alavanca          | Acionada ou em repouso.                                     |
| Armadilha         | Espinhos, runas ou desarmada.                               |
| Pilha de tesouro  | Moedas ou moedas com gemas.                                 |
| Entulho           | Terreno difícil por padrão.                                 |
| Teia de aranha    | Terreno difícil; restrições adicionais ficam com o mestre.  |
| Estalagmite       | Rocha ou cristal luminoso.                                  |
| Escada de mão     | Madeira ou corda, desenhada deitada no plano do grid.       |
| Círculo ritual    | Ritual, invocação ou apagado; iluminação configurável.      |
| Barricada         | Madeira ou estacas.                                         |

## Como decorar

1. Em **Mesa → Grid → Cenário**, encerre o combate se estiver ativo e clique em **Editar grid**.
2. Escolha a categoria **Masmorra**, ou pesquise pelo nome do elemento ou da variante. A busca aceita palavras sem acentos.
3. Configure variante, estilo, cor, tamanho, rotação e o nome opcional. O nome fica salvo na peça e aparece na lista de objetos.
4. Ajuste **Bloquear deslocamento** e **Bloquear visão** separadamente. Mesas, cercas, muretas baixas e grades permitem enxergar além delas por padrão. Objetos antigos mantêm seus valores até serem editados.
5. Clique no grid para colocar. Use **Girar 90°** para orientar o pincel. A rotação continua visual, dentro da área indicada pelas células.
6. Para repetir uma peça existente, selecione-a na lista e use **Copiar para pincel**. Escolha a nova posição no grid; a peça original é preservada.

**Favoritar elemento** adiciona o tipo à seleção local de favoritos. Favoritos aparecem primeiro; o botão **Favoritos** filtra a lista. Essa preferência é guardada no navegador, sem alterar a campanha dos demais participantes.

Ao mudar a variante, o pincel recebe os bloqueios e o custo padrão dessa variante. Configure ajustes personalizados depois dessa escolha. A altura visual continua independente da área ocupada e não implementa movimento vertical.

## Interações durante a partida

No painel **Cenário → Interações do cenário**, o mestre pode abrir e fechar portas, erguer e baixar grades, abrir celas, baús e sarcófagos e acionar ou repor alavancas. Essas operações estão disponíveis durante o combate, mesmo com a edição geral bloqueada.

- Abrir portas, grades e celas libera sua área para o movimento. Fechar uma porta também restaura seu bloqueio de visão; grades e celas continuam permitindo visão por padrão.
- Uma passagem não pode fechar sobre a base de um personagem, incluindo criaturas grandes.
- A interação conserva posição, dimensões, cor, estilo, nome, custo personalizado e demais metadados. Uma porta de ferro continua de ferro ao abrir.
- As interações são exclusivas do mestre, verificam a versão da peça e recusam alterações em sessões encerradas.
- Acionar uma alavanca muda sua aparência. O mestre decide quais outras peças ou eventos ela controla. Baús e sarcófagos não geram inventário automaticamente.

Armadilhas, teias, círculos rituais e tesouros são elementos de cenário. Testes de percepção/desarme, dano, salvaguardas, condições, cobertura e distribuição de tesouros são decididos pelo mestre. A base de regras continua sendo D&D 5e de 2014; esta atualização não mistura regras de 2024.

## Fluidez e organização do código

- **Cenário incremental:** atualizações que só mudam timestamps ou nomes reutilizam os modelos. Ao editar uma família de peças, as outras famílias mantêm seus buffers e materiais. Superfícies contínuas preservam a união sem sobreposição.
- **Prévias do ponteiro:** a posição é calculada no máximo uma vez por quadro, usando o chão. A seleção de modelos acontece no clique ou início/fim de arraste.
- **Terreno e névoa:** respostas com a mesma aparência preservam suas instâncias.
- **Destaques de movimento:** a área alcançável permanece pronta enquanto a rota de prévia muda. Destaques e névoa não provocam um novo cálculo dos limites de toda a cena.
- **Seleção de tokens:** trocar a seleção sem mudar uma miniatura dispensa recalcular suas sombras.
- **Recursos:** lotes removidos liberam os buffers, geometrias, materiais e texturas associados. O modo leve e a preferência por movimento reduzido continuam disponíveis.

Os novos módulos separam os modelos de masmorra, a arte 2D, o gerenciamento dos lotes 3D e as transições de estado. O catálogo e a migração mantêm os mesmos identificadores e variantes.

## Atualizar e verificar

Aplique **`supabase/migrations/202610130024_dungeon_scenery_and_interactions.sql`** depois das migrações anteriores. Ela acrescenta o catálogo e a operação de interação, conserva os objetos existentes e pode ser reaplicada. Não execute `supabase/schema.sql` em um banco existente. Veja [a ordem de atualização](LEIA-ME-ATUALIZACAO.md).

```bash
npm ci
npm run typecheck
npm test
npm run format:check
npm run build
```

O comando `npm run benchmark:grid` compara reconstruir todos os lotes com preservá-los em atualizações repetidas. Na validação desta revisão, **480 objetos × 40 atualizações**, com a mediana de cinco amostras, levaram **295,83 ms** com reconstrução integral e **36,14 ms** com reutilização: aproximadamente **8,2 vezes menos tempo de CPU nesse cenário**. O teste não mede FPS, GPU nem a rede; resultados em outros computadores variam.

Os testes de regras usam PostgreSQL local via PGlite. Os testes de navegador usam uma API de campanha isolada, incluindo criação/cópia de peças, abertura durante combate, colisões, modelos em 2D/3D e controles anteriores da mesa. As contas e campanhas reais não são usadas pela validação local.
